pragma circom 2.0.0;

include "../hasher/pedersen_bytes.circom";
include "../utils/bytes_to_num.circom";

template ServiceTableCommit(tableLen) {
    var i;
    var j;
    var serviceNameBytesWidth = 16;
    var servicePriceBytesWidth = 4;
    var serviceUpdatedAtBytesWidth = 8;
    var totalBytesWidth = serviceNameBytesWidth + servicePriceBytesWidth + serviceUpdatedAtBytesWidth;

    signal input serializedTable[totalBytesWidth * tableLen];

    component hasher = PedersenBytes(totalBytesWidth * tableLen);
    hasher.hashInput <== serializedTable;

    signal output serviceName[tableLen];
    signal output servicePriceAndUpdatedAt[tableLen];

    component packName[tableLen];
    component packPriceAndUpdatedAt[tableLen];

    for (i=0; i<tableLen; i++) {
        packName[i] = Bytes2Num(16);
        packPriceAndUpdatedAt[i] = Bytes2Num(12);
        for (j=0; j<serviceNameBytesWidth; j++) {
            packName[i].in[j] <== serializedTable[i*totalBytesWidth + j];
        }
        for (j=0; j<servicePriceBytesWidth + serviceUpdatedAtBytesWidth; j++) {
            packPriceAndUpdatedAt[i].in[j] <== serializedTable[i*totalBytesWidth + serviceNameBytesWidth + j];
        }
        packName[i].out ==> serviceName[i];
        packPriceAndUpdatedAt[i].out ==> servicePriceAndUpdatedAt[i];
    }

    signal output serviceTableCommitment[2];
    component packCommitment[2];
    packCommitment[0] = Bytes2Num(16);
    packCommitment[1] = Bytes2Num(16);
    for (i=0; i<16; i++) {
        packCommitment[0].in[i] <== hasher.hashOutput[i];
        packCommitment[1].in[i] <== hasher.hashOutput[i + 16];
    }
    serviceTableCommitment[0] <== packCommitment[0].out;
    serviceTableCommitment[1] <== packCommitment[1].out;
}