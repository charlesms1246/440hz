pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../hasher/keccak_bytes.circom";
include "../utils/bytes_to_num.circom";
include "./lookup.circom";

template BalanceTraceCheck(l) {
    var i;
    var j;
    var commitmentBytesWidth = 32;
    var serviceNameBytesWidth = 32; // string:[u8;32]
    var servicePriceBytesWidth = 4; // uint32:[u8;4]
    var countBytesWidth = 4; // uint32:[u8;4]
    var balanceBytesWidth = 16; // uint128:[u8;16]
    var priceTableLen = 3;

    signal input tableKeys[priceTableLen][serviceNameBytesWidth];
    signal input tableValues[priceTableLen][servicePriceBytesWidth];
    
    // input keys:values bits to hasher
    component hasher = Keccak256((serviceNameBytesWidth + servicePriceBytesWidth) * priceTableLen);
    for (i=0; i<priceTableLen; i++) {
        for (j=0; j<serviceNameBytesWidth; j++) {
            hasher.hashInput[i * (serviceNameBytesWidth + servicePriceBytesWidth) + j] <== tableKeys[i][j];
        } 
        for (j=0; j<servicePriceBytesWidth; j++) {
            hasher.hashInput[i * (serviceNameBytesWidth + servicePriceBytesWidth) + serviceNameBytesWidth + j] <== tableValues[i][j];
        }
    }

    signal output priceTableCommitment[commitmentBytesWidth];
    priceTableCommitment <== hasher.hashOutput;

    // pack keys and values to big num from bytes
    signal tableKeysBigUint[priceTableLen];
    signal tableValuesBigUint[priceTableLen];
    component packTableKeys[priceTableLen];
    component packTableValues[priceTableLen];
    for (i=0; i<priceTableLen; i++) {
        packTableKeys[i] = Bytes2Num(serviceNameBytesWidth);
        packTableValues[i] = Bytes2Num(servicePriceBytesWidth);
        packTableKeys[i].in <== tableKeys[i];
        packTableValues[i].in <== tableValues[i];
    }

    // lookup service price
    signal input serviceName[serviceNameBytesWidth]; 
    component packTargetKeys = Bytes2Num(serviceNameBytesWidth);
    packTargetKeys.in <== serviceName;
    
    component lookup = Lookup(priceTableLen);
    for (i=0; i<priceTableLen; i++) {
        lookup.key[i] <== packTableKeys[i].out;
        lookup.value[i] <== packTableValues[i].out;
    }
    lookup.targetKey <== packTargetKeys.out;
    
    signal input inputCount[l];
    signal input outputCount[l];
    signal costAccumulator[l];
    costAccumulator[0] <== (inputCount[0] + outputCount[0]) * lookup.targetValue;
    for (i=1; i<l; i++) {
        costAccumulator[i] <== costAccumulator[i-1] + (inputCount[i] + outputCount[i]) * lookup.targetValue;
    }

    signal input initBalance[balanceBytesWidth];
    component packBalance = Bytes2Num(balanceBytesWidth);
    packBalance.in <== initBalance;

    // costAccumulator must less eq than initBalance
    component let = LessEqThan(balanceBytesWidth*8);
    let.in[0] <== costAccumulator[l-1];
    let.in[1] <== packBalance.out;
    let.out === 1;
    
    component bytefyFinalBalance = Num2Bytes(balanceBytesWidth);
    bytefyFinalBalance.in <== packBalance.out - costAccumulator[l-1];
    log("finalBalance:", packBalance.out - costAccumulator[l-1]);
    signal output finalBalance[balanceBytesWidth];
    finalBalance <== bytefyFinalBalance.out;
}
