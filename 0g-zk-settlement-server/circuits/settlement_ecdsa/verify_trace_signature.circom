
pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/gates.circom";
include "../../node_modules/circomlib/circuits/binsum.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../hasher/keccak_bytes.circom";
include "../utils/bytes_to_num.circom";
include "../ecdsa/ecdsa_verify.circom";

template TraceSignatureVerify(l) {
    var i;
    var j;
    var serviceNameBytesWidth = 32; // string:[u8;32]
    var countBytesWidth = 4; // uint32:[u8;4]
    var nonceBytesWidth = 4; // unit32:[u8;4]

    // ecdsa
    signal input pubkeyBytes[2][32];

    signal input serviceNameBytes[serviceNameBytesWidth]; // string:uint256
    signal input inputCountBytes[l][countBytesWidth];
    signal input outputCountBytes[l][countBytesWidth];
    signal input nonceBytes[l][nonceBytesWidth];
    signal input rBytes[l][32];
    signal input sBytes[l][32];

    // ecdsa
    component hasher[l];
    for (i=0; i<l; i++) {
        hasher[i] = Keccak256(serviceNameBytesWidth + countBytesWidth*2 + nonceBytesWidth);
        // hasher[i] = PedersenBytes(serviceNameBytesWidth + countBytesWidth*2 + nonceBytesWidth);
        for (j=0; j<serviceNameBytesWidth; j++) {
            hasher[i].hashInput[j] <== serviceNameBytes[j];
        }
        for (j=0; j<countBytesWidth; j++) {
            hasher[i].hashInput[serviceNameBytesWidth + j] <== inputCountBytes[i][j];
        }
        for (j=0; j<countBytesWidth; j++) {
            hasher[i].hashInput[serviceNameBytesWidth + countBytesWidth + j] <== outputCountBytes[i][j];
        }
        for (j=0; j<nonceBytesWidth; j++) {
            hasher[i].hashInput[serviceNameBytesWidth + countBytesWidth*2 + j] <== nonceBytes[i][j];
        }
    }
    component verifier[l];
    for (i=0; i<l; i++) {
        verifier[i] = ECDSAVerify();
        verifier[i].rBytes <== rBytes[i];
        verifier[i].sBytes <== sBytes[i];
        verifier[i].msgHashBytes <== hasher[i].hashOutput;
        verifier[i].pubkeyBytes <== pubkeyBytes;
    }

    component packInputCount[l];
    component packOutputCount[l];
    component inputIsZero[l];
    component outputIsZero[l];
    component countAllZero[l];
    component sigValidOrCountAllZero[l];
    component sumFlag = BinSum(1, l);
    for (i=0; i<l; i++) {
        packInputCount[i] = Bytes2Num(countBytesWidth);
        packOutputCount[i] = Bytes2Num(countBytesWidth);
        packInputCount[i].in <== inputCountBytes[i];
        packOutputCount[i].in <== outputCountBytes[i];

        inputIsZero[i] = IsZero();
        outputIsZero[i] = IsZero();
        inputIsZero[i].in <== packInputCount[i].out;
        outputIsZero[i].in <== packOutputCount[i].out;

        countAllZero[i] = AND();
        countAllZero[i].a <== inputIsZero[i].out;
        countAllZero[i].b <== outputIsZero[i].out;
        
        sigValidOrCountAllZero[i] = OR();
        sigValidOrCountAllZero[i].a <== verifier[i].result;
        sigValidOrCountAllZero[i].b <== countAllZero[i].out;
        
        sumFlag.in[i][0] <== sigValidOrCountAllZero[i].out;
    }

    var sumFlagOutBits = nbits((2**1 -1)*l);
    component packFlag = Bits2Num(sumFlagOutBits);
    packFlag.in <== sumFlag.out;
    packFlag.out === l;

    signal output inputCount[l];
    signal output outputCount[l];
    for (i=0; i<l; i++) {
        inputCount[i] <== packInputCount[i].out;
        outputCount[i] <== packOutputCount[i].out;
    }
}