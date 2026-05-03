pragma circom 2.0.0;

include "./utils.circom";
include "./permutations.circom";

template Pad(nBits) {
    signal input in[nBits];
    var blockSize = 136*8;
    // 最后一个block只能装135bytes, 因此不是(nBits + blockSize - 1) \ blockSize;
    var nBlocks = (nBits + blockSize) \ blockSize;
    signal output out[nBlocks][blockSize];
    signal out2[blockSize];

    var i;
    var j;
    var k;

    // 前nBlocks - 1均为input，赋值给out
    for (i = 0; i < nBlocks - 1; i++) {
        for (j = 0; j < blockSize; j++) {
            out[i][j] <== in[i * blockSize + j];
        }
    }
    
    var remainInput = nBits - (nBlocks - 1) * blockSize;
    for (i=0; i<remainInput; i++) {
        out2[i] <== in[(nBlocks - 1) * blockSize + i];
    }

    var domain = 0x01;
    for (i=0; i<8; i++) {
         out2[remainInput + i] <== (domain >> i) & 1;
    }
    for (i=remainInput+8; i<blockSize; i++) {
        out2[i] <== 0;
    }

    component aux = OrArray(8);
    for (i = 0; i < 8; i++) {
        aux.a[i] <== out2[blockSize - 8 + i];
        aux.b[i] <== (0x80 >> i) & 1;
    }
    for (i = 0; i < 8; i++) {
        out[nBlocks - 1][blockSize - 8 + i] <== aux.out[i];
    }

    for (i = 0; i < blockSize - 8; i++) {
        out[nBlocks - 1][i] <== out2[i];
    }
}

template KeccakfRound(r) {
    signal input in[25*64];
    signal output out[25*64];
    var i;

    component theta = Theta();
    component rhopi = RhoPi();
    component chi = Chi();
    component iota = Iota(r);

    for (i=0; i<25*64; i++) {
        theta.in[i] <== in[i];
    }
    for (i=0; i<25*64; i++) {
        rhopi.in[i] <== theta.out[i];
    }
    for (i=0; i<25*64; i++) {
        chi.in[i] <== rhopi.out[i];
    }
    for (i=0; i<25*64; i++) {
        iota.in[i] <== chi.out[i];
    }
    for (i=0; i<25*64; i++) {
        out[i] <== iota.out[i];
    }
}

template Absorb() {
    var blockSizeBytes=136;

    signal input s[25*64];
    signal input block[blockSizeBytes*8];
    signal output out[25*64];
    var i;
    var j;

    component aux[blockSizeBytes/8];
    component newS = Keccakf();

    for (i=0; i<blockSizeBytes/8; i++) {
        aux[i] = XorArray(64);
        for (j=0; j<64; j++) {
            aux[i].a[j] <== s[i*64+j];
            aux[i].b[j] <== block[i*64+j];
        }
        for (j=0; j<64; j++) {
            newS.in[i*64+j] <== aux[i].out[j];
        }
    }
    // fill the missing s that was not covered by the loop over
    // blockSizeBytes/8
    for (i=(blockSizeBytes/8)*64; i<25*64; i++) {
            newS.in[i] <== s[i];
    }
    for (i=0; i<25*64; i++) {
        out[i] <== newS.out[i];
    }
}

template Final(nBits) {
    signal input in[nBits];
    signal output out[25 * 64];
    var blockSize = 136 * 8;
    var i;
    var j;
    var nBlocks = (nBits + blockSize) \ blockSize;

    // pad
    component pad = Pad(nBits);
    for (i=0; i<nBits; i++) {
        pad.in[i] <== in[i];
    }
    
    // absorb
    component abs[nBlocks];
    for (i=0; i<nBlocks; i++) {
        abs[i] = Absorb();
        for (j=0; j<blockSize; j++) {
            abs[i].block[j] <== pad.out[i][j];
        }
        for (j=0; j<25*64; j++) {
            if (i > 0) {
                abs[i].s[j] <== abs[i - 1].out[j];
            } else {
                abs[i].s[j] <== 0;
            }
        }
    }

    for (i=0; i<25*64; i++) {
        out[i] <== abs[nBlocks - 1].out[i];
    }
}

template Squeeze(nBits) {
    signal input s[25*64];
    signal output out[nBits];
    var i;
    var j;

    for (i=0; i<25; i++) {
        for (j=0; j<64; j++) {
            if (i*64+j<nBits) {
                out[i*64+j] <== s[i*64+j];
            }
        }
    }
}

template Keccakf() {
    signal input in[25*64];
    signal output out[25*64];
    var i;
    var j;

    // 24 rounds
    component round[24];
    signal midRound[24*25*64];
    for (i=0; i<24; i++) {
        round[i] = KeccakfRound(i);
        if (i==0) {
            for (j=0; j<25*64; j++) {
                midRound[j] <== in[j];
            }
        }
        for (j=0; j<25*64; j++) {
            round[i].in[j] <== midRound[i*25*64+j];
        }
        if (i<23) {
            for (j=0; j<25*64; j++) {
                midRound[(i+1)*25*64+j] <== round[i].out[j];
            }
        }
    }

    for (i=0; i<25*64; i++) {
        out[i] <== round[23].out[i];
    }
}

template Keccak(nBitsIn, nBitsOut) {
    signal input in[nBitsIn];
    signal output out[nBitsOut];
    var i;

    component f = Final(nBitsIn);
    for (i=0; i<nBitsIn; i++) {
        f.in[i] <== in[i];
    }
    component squeeze = Squeeze(nBitsOut);
    for (i=0; i<25*64; i++) {
        squeeze.s[i] <== f.out[i];
    }
    for (i=0; i<nBitsOut; i++) {
        out[i] <== squeeze.out[i];
    }
}