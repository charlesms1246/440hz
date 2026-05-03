pragma circom 2.0.2; 

include "../utils/bytes_to_num.circom";
include "./ecdsa.circom";

template ECDSAVerify() {
    var i;
    var j;
    var n = 64; // bits per chunk
    var k = 4; // chunks
    var m = n / 8; // bytes per chunk

    signal input rBytes[32];
    signal input sBytes[32];
    signal input msgHashBytes[32];
    signal input pubkeyBytes[2][32];

    signal rrBytes[32];
    signal rsBytes[32];
    signal rmsgHashBytes[32];
    signal rpubkeyBytes[2][32];

    for (i=0; i<32; i++) {
        rrBytes[i] <== rBytes[31 - i];
        rsBytes[i] <== sBytes[31 - i];
        rmsgHashBytes[i] <== msgHashBytes[31 - i];
        rpubkeyBytes[0][i] <== pubkeyBytes[0][31 - i];
        rpubkeyBytes[1][i] <== pubkeyBytes[1][31 - i];
    }

    signal r[k];
    signal s[k];
    signal msghash[k];
    signal pubkey[2][k];

    component rBytesTou64[k];
    component sBytesTou64[k];
    component hashBytesTou64[k];
    component pubkeyBytesTou64X[k];
    component pubkeyBytesTou64Y[k];

    for (i=0; i<k; i++) {
        rBytesTou64[i] = Bytes2Num(m);
        sBytesTou64[i] = Bytes2Num(m);
        hashBytesTou64[i] = Bytes2Num(m);
        pubkeyBytesTou64X[i] = Bytes2Num(m);
        pubkeyBytesTou64Y[i] = Bytes2Num(m);

        for (j=0; j<m; j++) {
            rBytesTou64[i].in[j] <== rrBytes[i*m + j];
            sBytesTou64[i].in[j] <== rsBytes[i*m + j];
            hashBytesTou64[i].in[j] <== rmsgHashBytes[i*m + j];
            pubkeyBytesTou64X[i].in[j] <== rpubkeyBytes[0][i*m + j];
            pubkeyBytesTou64Y[i].in[j] <== rpubkeyBytes[1][i*m + j];
        }
        r[i] <== rBytesTou64[i].out;
        s[i] <== sBytesTou64[i].out;
        msghash[i] <== hashBytesTou64[i].out;
        pubkey[0][i] <== pubkeyBytesTou64X[i].out;
        pubkey[1][i] <== pubkeyBytesTou64Y[i].out;
        // log("r:", r[i], "s:", s[i], "msg:", msghash[i], "pub0:", pubkey[0][i], "pub1:", pubkey[1][i]);
    }

    component verifer = ECDSAVerifyNoPubkeyCheck(n, k);
    verifer.r <== r;
    verifer.s <== s;
    verifer.msghash <== msghash;
    verifer.pubkey <== pubkey;
    
    signal output result;
    result <== verifer.result;
}