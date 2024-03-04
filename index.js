const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { exec } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');

admin.initializeApp();

exports.runOpenSSLCommand = functions.storage.object().onFinalize(async (object) => {

    if (object.name!== "manifest.json") {
      // doesn't match, so return early
      return;
    }
    // Log the object information for debugging
    console.log('name:', object.name);

    const bucket = admin.storage().bucket('gs://bucket-name'); // The Storage bucket that contains the file.
    const filePath = object.name; // File path in the bucket.

    // Define the path to download the manifest.json file
    const manifestFilePath = '/tmp/manifest.json';
    await bucket.file(filePath).download({ destination: manifestFilePath });

    // Define the OpenSSL command
    const opensslCommand = 'openssl smime -binary -sign -certfile /tmp/wwdr.pem -signer /tmp/signerCert.pem -inkey /tmp/signerKey.pem -in ' + manifestFilePath + ' -out /tmp/signature.der -outform DER -passin pass:test';


    // Download files from Firebase Storage
    await bucket.file('wwdr.pem').download({ destination: '/tmp/wwdr.pem' });
    await bucket.file('signerCert.pem').download({ destination: '/tmp/signerCert.pem' });
    await bucket.file('signerKey.pem').download({ destination: '/tmp/signerKey.pem' });

    // Execute the OpenSSL command
    await new Promise((resolve, reject) => {
        exec(opensslCommand, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error running OpenSSL command: ${error.message}`);
                reject(error);
            } else {
                console.log(`OpenSSL command output (stdout): ${stdout}`);
                console.error(`OpenSSL command output (stderr): ${stderr}`);
                resolve(stdout);
            }
        });
    });

    // Upload the result to Firebase Storage
    const tempFilePath = '/tmp/signature.der';
    await bucket.upload(tempFilePath, {
        destination: 'signature.der'
    });

    // After successfully saving the result file
    const statusRef = admin.database().ref('function_status');
    statusRef.set({ status: 'completed', timestamp: admin.database.ServerValue.TIMESTAMP });

    // Clean up the temporary files
    fs.unlinkSync(tempFilePath);
    fs.unlinkSync('/tmp/wwdr.pem');
    fs.unlinkSync('/tmp/signerCert.pem');
    fs.unlinkSync('/tmp/signerKey.pem');

    return null;
});
