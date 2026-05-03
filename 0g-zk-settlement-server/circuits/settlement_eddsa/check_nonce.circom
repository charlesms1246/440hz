pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/comparators.circom";
include "../../node_modules/circomlib/circuits/binsum.circom";
include "../utils/bytes_to_num.circom";

template NonceCheck(traceLen) {
    var i;
    var nonceBytesWidth = 8; // unit32:[u8;8]

    signal input nonce[traceLen]; 

    component sumFlag = BinSum(1, traceLen-1);
    component LT[traceLen - 1];
    for (i=0; i<traceLen-1; i++) {
        LT[i] = LessThan(nonceBytesWidth * 8);
        LT[i].in[0] <== nonce[i];
        LT[i].in[1] <== nonce[i+1];
        sumFlag.in[i][0] <== LT[i].out;
    }
    var sumFlagOutBits = nbits((2**1 -1)*(traceLen-1));
    component packFlag = Bits2Num(sumFlagOutBits);
    packFlag.in <== sumFlag.out;
    packFlag.out === traceLen - 1;

    signal output initNonce;
    signal output finalNonce;
    initNonce <== nonce[0];
    finalNonce <== nonce[traceLen-1];
}