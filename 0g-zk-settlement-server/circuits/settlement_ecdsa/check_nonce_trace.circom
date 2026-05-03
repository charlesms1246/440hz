pragma circom 2.0.0;
include "../utils/bytes_to_num.circom";

template NonceTraceCheck(l) {
    var i;
    var nonceBytesWidth = 4; // unit32:[u8;4]

    signal input nonce[l][nonceBytesWidth]; 
    component packNonce[l];
    for (i=0; i<l; i++) {
        packNonce[i] = Bytes2Num(nonceBytesWidth);
        packNonce[i].in <== nonce[i];
    }

    signal input initNonce[nonceBytesWidth];
    component packInit = Bytes2Num(nonceBytesWidth);
    packInit.in <== initNonce;

    packNonce[0].out === packInit.out + 1;
    for (i=1; i<l; i++) {
        packNonce[i].out === packNonce[i-1].out + 1;
    }
    log("finalNonce:", packNonce[l-1].out);
    component bytefyFinal = Num2Bytes(4);
    bytefyFinal.in <== packNonce[l-1].out;
    signal output finalNonce[nonceBytesWidth];
    finalNonce <== bytefyFinal.out;
}