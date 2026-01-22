
// services/rasPiService.js 
const rasPiRepository = require("../repositories/rasPiRepository.js");

async function insertMetadata(metadata) {
  return rasPiRepository.insert(metadata);
}

async function getAccessPointDetails() {
  return rasPiRepository.getAccessPointDetails();
}

module.exports = { insertMetadata, getAccessPointDetails };

/* return assessmentRepository.insert({
    userId,
    networkId: payload.networkId,
    metrics,
    score,
    createdAt: new Date(), //need to coordinate with the raspi, kung iccompare ung real-time scanning ng raspi vs db time
});
}

module.exports = { createFromApp }; */
