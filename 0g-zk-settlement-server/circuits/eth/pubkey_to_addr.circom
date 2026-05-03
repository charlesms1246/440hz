pragma circom 2.0.2;

include "../hasher/keccak_bytes.circom";

template PubkeyToAddress() {
    var i;
    var addressBytesWidth = 20;
    signal input pubkeyBytes[2][32];
    component hasher = Keccak256(32*2);
    for (i=0; i<32; i++) {
      hasher.hashInput[i] <== pubkeyBytes[0][i];
      hasher.hashInput[32+i] <== pubkeyBytes[1][i];
    }

    signal output address[addressBytesWidth];
    for (i=0; i<addressBytesWidth; i++) {
      address[i] <== hasher.hashOutput[12+i];
    }
}