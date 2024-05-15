import {Harvester} from '@natlibfi/melinda-record-import-commons';
import createHarvestCallback from './harvest';

const {startHarvester} = Harvester;

import {
  harvestingApiUrl, metadataPrefix,
  filterIsbnOnly, filterIssuedYear,
  pollInterval, pollChangeTimestamp, changeTimestampFile
} from './config';

startHarvester(({recordsCallback}) => createHarvestCallback({
  recordsCallback, harvestingApiUrl, metadataPrefix,
  filterIsbnOnly, filterIssuedYear,
  pollInterval, pollChangeTimestamp, changeTimestampFile
}));
