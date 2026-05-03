// keccack hash with bytes input and output
// input and output are encoded in u8 little-endian format

pragma circom 2.0.0;
include "../../node_modules/circomlib/circuits/bitify.circom";
include "./keccak.circom";

template Keccak256(nBytes) {
    var i;
    var j;
    var nBits = nBytes * 8;
    var hashBytes = 32;
    var hashBits = 32 * 8;

    signal input hashInput[nBytes];
    component byteToBits[nBytes];
    component hasher = Keccak(nBits, hashBits);
    for (i=0; i<nBytes; i++) {
        byteToBits[i] = Num2Bits(8);
        byteToBits[i].in <== hashInput[i];
        for (j=0; j<8; j++) {
            hasher.in[i*8+j] <== byteToBits[i].out[j];
        }
    }

    signal output hashOutput[hashBytes];
    component bitsToByte[hashBytes];
    for (i=0; i<hashBytes; i++) {
        bitsToByte[i] = Bits2Num(8);
        for (j=0; j<8; j++) {
            bitsToByte[i].in[j] <== hasher.out[i*8+j];
        }
        hashOutput[i] <== bitsToByte[i].out;
    }
}