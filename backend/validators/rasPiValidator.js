// validators/rasPiValidators.js
function insertMetadataValidator(req, res, next) {
  const { SSID, Status, Encryption_status, Security_status } = req.body;

  //exclude ko muna hidden_ssid === undefined

  if (!SSID || !Status || !Encryption_status || !Security_status ) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  // basic example; you can add regex/email checks, etc.
  next();
}

module.exports = { insertMetadataValidator };
