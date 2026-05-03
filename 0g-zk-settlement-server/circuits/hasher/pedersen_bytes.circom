pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/pedersen.circom";
include "../utils/bytes_to_num.circom";
include "../ecdsa/bigint_func.circom";


template PedersenBytes(nBytes) {
    var i;
    var j;
    var nBits = nBytes * 8;

    signal input hashInput[nBytes];
    component byteToBits[nBytes];
    component hasher = Pedersen(nBits);
    for (i=0; i<nBytes; i++) {
        byteToBits[i] = Num2Bits(8);
        byteToBits[i].in <== hashInput[i];
        for (j=0; j<8; j++) {
            hasher.in[i*8+j] <== byteToBits[i].out[j];
        }
    }

    component bytesY = Num2Bytes(32);
    bytesY.in <== hasher.out[1];
    component lastBits = Num2Bits(8);
    lastBits.in <== bytesY.out[31];
    var diff = hasher.out[0] - 10944121435919637611123202872628637544274182200208017171849102093287904247808;
    var lastByte = bytesY.out[31];
    if (diff > 0) {
        lastByte |= 128;
    }

    signal output hashOutput[32];
    for (i=0; i<31; i++) {
        hashOutput[i] <-- bytesY.out[i];
    }
    hashOutput[31] <-- lastByte;
}