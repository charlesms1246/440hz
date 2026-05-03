pragma circom 2.0.2;

include "../utils/bytes_to_num.circom";
include "./pubkey_to_addr.circom";
include "../ecdsa/ecdsa.circom";

template PrivkeyToAddress() {
    var i;
    var j;
    var n = 64; // bits per chunk
    var k = 4; // chunks
    var m = n / 8; // bytes per chunk
    var addressBytesWidth = 20;

    signal input privkeyBytes[32];

    component bytesTou64[k];
    signal privkey[k];
    for (i=0; i<k; i++) {
        bytesTou64[i] = Bytes2Num(m);
        for (j=0; j<m; j++) {
            bytesTou64[i].in[j] <== privkeyBytes[i*m + j];
        }
        privkey[i] <== bytesTou64[i].out;
    }


    component privToPub = ECDSAPrivToPub(n, k);
    for (i=0; i<k; i++) {
        privToPub.privkey[i] <== privkey[i];
    }

    component u64ToBytesX[m];
    component u64ToBytesY[m];
    for (i=0; i<k; i++) {
        u64ToBytesX[i] = Num2Bytes(m);
        u64ToBytesY[i] = Num2Bytes(m);
        u64ToBytesX[i].in <== privToPub.pubkey[0][i];
        u64ToBytesY[i].in <== privToPub.pubkey[1][i];
    }

    component pubToAddr = PubkeyToAddress();
    for (i=0; i<k; i++) {
        for (j=0; j<m; j++) {
            pubToAddr.pubkeyBytes[0][i * m + j] <== u64ToBytesX[i].out[j];
            pubToAddr.pubkeyBytes[1][i * m + j] <== u64ToBytesY[i].out[j];
        }
    }

    signal output addr[addressBytesWidth];
    addr <== pubToAddr.address;
}