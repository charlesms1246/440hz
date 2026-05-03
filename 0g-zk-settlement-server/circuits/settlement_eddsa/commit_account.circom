pragma circom 2.0.0;
include "../hasher/pedersen_bytes.circom";
include "../utils/bytes_to_num.circom";

template AccountCommit() {
    var i;
    var j;
    var addressBytesWidth = 20; // unit160:[u8;20]
    var nonceBytesWidth = 8; // unit32:[u8;8]
    var balanceBytesWidth = 16; // unit128:[u8;16]
    var totalBytesWidth = nonceBytesWidth + balanceBytesWidth + addressBytesWidth*2;
    
    component hasher = PedersenBytes(totalBytesWidth);
    signal input serializedAccount[totalBytesWidth];
    hasher.hashInput <== serializedAccount;

    signal output accountCommitment[2];
    component packCommitment[2];
    for (i=0; i<2; i++) {
        packCommitment[i] = Bytes2Num(16);
        for (j=0; j<16; j++) {
            packCommitment[i].in[j] <== hasher.hashOutput[i*16 + j];
            // log(i*16 + j, ":" , hasher.hashOutput[i*16 + j]);
        }
        accountCommitment[i] <== packCommitment[i].out;
    }

    signal output nonce;
    signal output balance;
    signal output userAddress;
    signal output providerAddress;
    component packNone = Bytes2Num(nonceBytesWidth);
    component packBalance = Bytes2Num(balanceBytesWidth);
    component packUserAddress = Bytes2Num(addressBytesWidth);
    component packProviderAddress = Bytes2Num(addressBytesWidth);
    for (i=0; i<nonceBytesWidth; i++) {
        packNone.in[i] <== serializedAccount[i];
    }
    for (i=0; i<balanceBytesWidth; i++) {
        packBalance.in[i] <== serializedAccount[nonceBytesWidth + i];
    }
    for (i=0; i<addressBytesWidth; i++) {
        packUserAddress.in[i] <== serializedAccount[i + nonceBytesWidth + balanceBytesWidth];
    }
    for (i=0; i<addressBytesWidth; i++) {
        packProviderAddress.in[i] <== serializedAccount[i + nonceBytesWidth + balanceBytesWidth + addressBytesWidth];
    }
    nonce <== packNone.out;
    balance <== packBalance.out;
    userAddress <== packUserAddress.out;
    providerAddress <== packProviderAddress.out;
}