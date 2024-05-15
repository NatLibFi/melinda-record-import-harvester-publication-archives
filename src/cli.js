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
