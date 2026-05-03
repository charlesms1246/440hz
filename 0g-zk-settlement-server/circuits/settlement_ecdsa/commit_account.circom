pragma circom 2.0.0;
include "../hasher/keccak_bytes.circom";

template AccountCommit() {
    var i;
    var j;
    var addressBytesWidth = 20; // unit160:[u8;20]
    var nonceBytesWidth = 4; // unit32:[u8;4]
    var balanceytesWidth = 16; // unit128:[u8;16]
    var hashInputLen = addressBytesWidth*2 + nonceBytesWidth + balanceytesWidth;
    var hashOutputLen = 32;

    // account content
    signal input userAddress[addressBytesWidth];
    signal input providerAddress[addressBytesWidth];
    signal input nonce[nonceBytesWidth]; 
    signal input balance[balanceytesWidth]; 

    signal output commitment[hashOutputLen];

    component hasher = Keccak256(hashInputLen);
    for (i=0; i<addressBytesWidth; i++) {
        hasher.hashInput[i] <== userAddress[i];
    }
    for (i=0; i<addressBytesWidth; i++) {
        hasher.hashInput[i + addressBytesWidth] <== providerAddress[i];
    }
    for (i=0; i<nonceBytesWidth; i++) {
        hasher.hashInput[i + addressBytesWidth*2] <== nonce[i];
    }
    for (i=0; i<balanceytesWidth; i++) {
        hasher.hashInput[i + addressBytesWidth*2 + nonceBytesWidth] <== balance[i];
    }

    commitment <== hasher.hashOutput;
}