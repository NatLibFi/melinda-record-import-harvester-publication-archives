/**
*
* @licstart  The following is the entire license notice for the JavaScript code in this file.
*
* Helmet record harvester for the Melinda record batch import system
*
* Copyright (c) 2018-2019 University Of Helsinki (The National Library Of Finland)
*
* This file is part of melinda-record-import-harvester-helmet
*
* melinda-record-import-harvester-helmet program is free software: you can redistribute it and/or modify
* it under the terms of the GNU Affero General Public License as
* published by the Free Software Foundation, either version 3 of the
* License, or (at your option) any later version.
*
* melinda-record-import-harvester-helmet is distributed in the hope that it will be useful,
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

import startHarvesting from './harvest';
import {Harvester} from '@natlibfi/melinda-record-import-commons';
import {
  name, harvestingApiUrl, metadataPrefix,
  filterIsbnOnly, filterIssuedYear,
  pollInterval, pollChangeTimestamp, changeTimestampFile
} from './config';

const {runCLI} = Harvester;

runCLI({
  name,
  callback: callback => startHarvesting({
    harvestingApiUrl, metadataPrefix, pollInterval, pollChangeTimestamp,
    changeTimestampFile, filterIsbnOnly, filterIssuedYear,
    onlyOnce: true,
    recordsCallback: records => callback(records)
  })
});
