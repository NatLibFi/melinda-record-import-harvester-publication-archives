/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Helmet record harvester for the Melinda record batch import system
*
* Copyright (C) 2018 University Of Helsinki (The National Library Of Finland)
*
* This file is part of melinda-record-import-harvester-publication-archives
*
* melinda-record-import-harvester-publication-archives program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* melinda-record-import-harvester-publication-archives is distributed in the hope that it will be useful,
* but WITHOUT ANY WARRANTY; without even the implied warranty of
* MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
* GNU Affero General Public License for more details.
*
* You should have received a copy of the GNU Affero General Public License
* along with this program.  If not, see <http://www.gnu.org/licenses/>.
*
* @licend  The above is the entire license notice
* for the JavaScript code in this file.
*
*/

'use strict';
// Haravointi tapahtuu [OAI-PMH -rajapinnalla|https://www.openarchives.org/OAI/openarchivesprotocol.html].
// Kyseessä on HTTP-rajapinta, jolla tietueita haetaan aikaleiman perusteella. Rajapinnan aikaleimarajaus ei
// kuitenkaan riitä setin kunnolliseen rajaukseen vaan varsinainen rajaus tehdään tietueen **date"qualifier="available** -kentän perusteella.

// > Tietueita haravoidaan rajapinnan **ListRecords** kutsulla. Vastaukseen ei välttämättä sisälly kaikki osuvat
// tietueet vaan loput täytyy hakea **resumptionToken** parametrin avulla.

// > Haravointisovelluksen on tarkoitus olla päällä jatkuvasti ja sen pitää tallentaa edellisen haun aikaleima
// tiedostoon, jotta haravointia voidaan jatkaa oikeasta kohdasta uudelleenkäynnistyksen jälkeen.

// > Vastaavanlainen toteutus on tehty [Helmetille|https://github.com/NatLibFi/melinda-record-import-harvesterhelmet].

// > [DC -> MARC -mäppäys|https://www.kiwi.fi/x/D43VBQ]

// > [Haravoitavat kohteet|https://www.kiwi.fi/display/alephkvp/Melindaa+varten+haravoitavien+julkaisuarkistojen+OAI-rajapinnat]

import fs from 'fs';
import xml2js from 'xml2js';
import path from 'path';
import {URL, URLSearchParams} from 'url';
import moment from 'moment';
import fetch from 'node-fetch';
import HttpStatusCodes from 'http-status-codes';
import nodeUtils from 'util';
import {CommonUtils as Utils} from '@natlibfi/melinda-record-import-commons';
import filterxml from 'filterxml';

//Development XML
import {shortValidXML, shortExtraXML} from './dummyXML.js';

run();

async function run() {
	Utils.registerSignalHandlers();
	Utils.checkEnv([
		// 'MELINDA_API_KEY',
		// 'MELINDA_API_SECRET',
		'MELINDA_API_URL',
		'RECORD_IMPORT_API_URL',
		'RECORD_IMPORT_API_USERNAME',
		'RECORD_IMPORT_API_PASSWORD',
		'RECORD_IMPORT_API_PROFILE'
	]);

	const OAIEndpoints = [
		{ OAI: 'http://tampub.uta.fi/oai/request', metadata: 'kk'},	 	 
		{ OAI: 'http://www.doria.fi/oai/request', metadata: 'kk'},
		{ OAI: 'http://utupub.fi/oai/request', metadata: 'kk'},
		{ OAI: 'http://lauda.ulapland.fi/oai/request', metadata: 'kk'},
		{ OAI: 'http://www.julkari.fi/oai/request', metadata: 'kk'},
		{ OAI: 'http://osuva.uwasa.fi/oai/request', metadata: 'kk'},
		{ OAI: 'https://julkaisut.valtioneuvosto.fi/oai/request', metadata: 'kk'},
		{ OAI: 'http://jukuri.luke.fi/oai/request', metadata: 'kk'},
		{ OAI: 'http://www.theseus.fi/oai/request', metadata: 'kk'},
	];

	const RECORDS_FETCH_LIMIT = 1000;
	const POLL_INTERVAL = process.env.POLL_INTERVAL || 1800000; // Default is 30 minutes
	const CHANGE_TIMESTAMP_FILE = process.env.POLL_CHANGE_TIMESTAMP_FILE || path.resolve(__dirname, '..', '.poll-change-timestamp.json');
	const setTimeoutPromise = nodeUtils.promisify(setTimeout);

	const logger = Utils.createLogger();
	const stopHealthCheckService = Utils.startHealthCheckService(process.env.HEALTH_CHECK_PORT);
	const parser = new xml2js.Parser();
	try {
		logger.log('info', 'Starting melinda-record-import-harvester-publication-archives');
		await processRecords();
		stopHealthCheckService();
		process.exit();
	} catch (err) {
		stopHealthCheckService();
		logger.error(err);
		process.exit(-1);
	}

	async function processRecords(pollChangeTime) {
		pollChangeTime = pollChangeTime || getPollChangeTime();
		
		logger.log('debug', `Fetching records created after ${pollChangeTime.format()}`);

		const timeBeforeFetching = await fetchRecords(0, null, [], pollChangeTime);

		console.log("Checking out records")
		if (records.length > 0) {
			await sendRecords(records);
		}

		logger.log('debug', `Waiting ${POLL_INTERVAL / 1000} seconds before polling again`);
		console.log("Waiting " + POLL_INTERVAL / 1000 + " seconds before polling again")
		await setTimeoutPromise(POLL_INTERVAL);

		writePollChangeTimestamp(timeBeforeFetching);

		return processRecords(timeBeforeFetching.add(1, 'seconds'));

		function getPollChangeTime() {
			if (fs.existsSync(CHANGE_TIMESTAMP_FILE)) {
				const data = JSON.parse(fs.readFileSync(CHANGE_TIMESTAMP_FILE, 'utf8'));
				return moment(data.timestamp);
			}

			if (process.env.POLL_CHANGE_TIMESTAMP) {
				return moment(process.env.POLL_CHANGE_TIMESTAMP);
			}

			return moment();
		}

		function writePollChangeTimestamp(time) {
			fs.writeFileSync(CHANGE_TIMESTAMP_FILE, JSON.stringify({
				timestamp: time.format()
			}));
		}

		async function fetchRecords(index, token, records = [], timeBeforeFetching) {
			console.log("--------------------------");
			console.log("OAI index: ", index, " length: ", OAIEndpoints.length); //: ", OAIEndpoints, "
			const url = new URL(OAIEndpoints[index].OAI);

			if(token){
				url.search = new URLSearchParams({
					verb: 'ListRecords',
					resumptionToken: token
				});
			}else{
				url.search = new URLSearchParams({
					verb: 'ListRecords',
					from: '2018-09-10T20:30:00Z',
					metadataPrefix: OAIEndpoints[index].metadata
				});
			}

			logger.log('debug', url.toString());

			var response = await fetch(url.toString());
 
			if (response.status === HttpStatusCodes.OK) {
				var result = null;
				var validXML = null;
				if( process.env.TEST === 'true' ){
					result = shortExtraXML;
				}else{
					result = await response.text();
				}
	
				//Filter out all records that do not have qualifier="available" in some field
				var patterns = ['x:metadata[not(x:field[@qualifier="available"])]/../..'];
				var namespaces = {
					x: 'http://kk/1.0',
				};
				filterxml(result, patterns, namespaces, function (err, xmlOut) {
					if (err) { throw err; }
					validXML = xmlOut;
				});

				//Check out how many records were fetched and save possible resumption token
				var resumptionToken = null;
				var concatRecords = [];
				parser.parseString(validXML, function (err, result) {
					try{
						if( result['OAI-PMH'].ListRecords ){
							concatRecords = records.concat(result['OAI-PMH'].ListRecords[0].record)
							var amountRecords = result['OAI-PMH'].ListRecords[0].record.length;
							logger.log('debug', `Retrieved ${amountRecords} records`);

							resumptionToken = result['OAI-PMH'].ListRecords[0].resumptionToken;
						}
						console.log("Resumption: ", resumptionToken)

					}catch(e){
						console.log("Failed something in XML parsing: ", e);
						logger.error(e);
					}
				});

				// If more records to be fetched from endpoint do so with resumption token, if not move to next endpoint 
				if (resumptionToken &&  resumptionToken[0] && resumptionToken[0]['_']) {
					return fetchRecords(index, resumptionToken[0]['_'], concatRecords, timeBeforeFetching);
				}else{
					console.log("Moving to next, found records: ", concatRecords.length);
					sendRecords(concatRecords);
					index++;
					if(index === OAIEndpoints.length){
						timeBeforeFetching = records.length > 0 ? timeBeforeFetching : moment();
						console.log("Time: ", timeBeforeFetching);
						return timeBeforeFetching;
					}
					return fetchRecords(index, null, [], timeBeforeFetching);
				}
			}

			if (response.status === HttpStatusCodes.NOT_FOUND) {
				logger.log('debug', 'No records found');
				return {records, timeBeforeFetching};
			}

			throw new Error(`Received HTTP ${response.status} ${response.statusText}`);
		}

		async function sendRecords(records) { // eslint-disable-line require-await
			fs.writeFileSync('fetched.json', JSON.stringify(records, undefined, 2));
			// Use Record import API to create Blobs
			logger.log('info', `Created new blob x containing ${records.length} records`);
		}
	}
}

// //Concatting records to previous records
// if(amountRecords && amountRecords > 0){
// 	console.log("Records: ", records, typeof(records));
// 	console.log("Concatting: ", result['OAI-PMH'].ListRecords[0].record);
// 	var newArr = records.concat(result['OAI-PMH'].ListRecords[0].record)
// 	console.log("Records: ", newArr)
// }

// var patterns = ['x:metadata[not(x:field[@qualifier="available"])]'];
// var patterns = ['x:metadata/x:field[@qualifier="available"]/../../..']; //Removes all records containing qualifier="available"
// var patterns = ['x:field[@qualifier="available"]']; //Removes single field

// index++;
// if(index >= OAIEndpoints.length) index = 0;
// console.log("Moving to next: ", index);
// return fetchRecords(index, null, [], timeBeforeFetching);
// console.log("Result: ", result);
// return {records: records.concat(result.entries), timeBeforeFetching};


// Function filterRecords(record) {
// 	record.varFields.array.forEach(element => {
// 		console.log('E: ', element);
// 	});
// 	// Const leader = record.varFields.find(f => f.fieldTag === '_');

// 	// if (leader && !['c', 'd', 'j'].includes(leader.content)) {
// 	// 	if (record.varFields.some(check09)) {
// 	// 		return false;
// 	// 	}

// 	// 	const f007 = record.varFields.find(f => f.marcTag === '007');

// 	// 	if (!f007 && MATERIAL_TYPES_DROP_PATTERN.test(record.materialType.code)) {
// 	// 		return false;
// 	// 	}

// 	// 	return true;
// 	// }

// 	// function check09(field) {
// 	// 	return /^09[12345]$/.test(field.marcTag) && field.subfields.find(sf => {
// 	// 		return /^78/.test(sf.content);
// 	// 	});
// 	// }
// }

// Async function validateAuthorizationToken(token) {
// 	if (token) {
// 		const response = await fetch(`${process.env.MELINDA_API_URL}/info/token`);
// 		if (response.status === HttpStatusCodes.OK) {
// 			return token;
// 		}
// 	}

// 	return authenticate();

// 	async function authenticate() {
// 		const credentials = `${process.env.MELINDA_API_KEY}:${process.env.MELINDA_API_SECRET}`;
// 		const response = await fetch(`${process.env.MELINDA_API_URL}/token`, {method: 'POST', headers: {
// 			Authorization: `Basic ${Buffer.from(credentials).toString('base64')}`
// 		}});

// 		const body = await response.json();
// 		return body.access_token;
// 	}
// }