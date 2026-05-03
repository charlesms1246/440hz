pragma circom 2.0.2; 

include "../keccak/bytes_to_num.circom";
include "./ecdsa.circom";

template PrivkeyToPubkey() {
    var i;
    var j;
    var n = 64; // bits per chunk
    var k = 4; // chunks
    var m = n / 8; // bytes per chunk

    signal input privkeyBytes[32];
    signal rprivkeyBytes[32];
    for (i=0; i<32; i++) {
        rprivkeyBytes[i] <== privkeyBytes[31 - i];
    }

    signal privkey[k];
    component privkeyBytesTou64[k];
    for (i=0; i<k; i++) {
        privkeyBytesTou64[i] = Bytes2Num(m);
        for (j=0; j<m; j++) {
            privkeyBytesTou64[i].in[j] <== rprivkeyBytes[i*m + j];
        }
        privkey[i] <== privkeyBytesTou64[i].out;
    }

    component privToPub = ECDSAPrivToPub(n, k);
    privToPub.privkey <== privkey;

    component unpackPubkeyX[k];
    component unpackPubkeyY[k];
    signal rpubkeyBytes[2][32];
    for (i=0; i<k; i++) {
        unpackPubkeyX[i] = Num2Bytes(m);
        unpackPubkeyY[i] = Num2Bytes(m);
        unpackPubkeyX[i].in <== privToPub.pubkey[0][i];
        unpackPubkeyY[i].in <== privToPub.pubkey[1][i];
        for (j=0; j<m; j++) {
            rpubkeyBytes[0][i*m + j] <== unpackPubkeyX[i].out[j];
            rpubkeyBytes[1][i*m + j] <== unpackPubkeyY[i].out[j];
        }
    }

    signal output pubkeyBytes[2][32];
    for (i=0; i<32; i++) {
        pubkeyBytes[0][i] <== rpubkeyBytes[0][31-i];
        pubkeyBytes[1][i] <== rpubkeyBytes[1][31-i];
    }
}