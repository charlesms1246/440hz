pragma circom 2.0.0;

include "../node_modules/circomlib/circuits/comparators.circom";
include "./eth/pubkey_to_addr.circom";
include "./settlement_ecdsa/commit_account.circom";
include "./settlement_ecdsa/lookup.circom";
include "./settlement_ecdsa/check_balance_trace.circom";
include "./settlement_ecdsa/check_nonce_trace.circom";
include "./settlement_ecdsa/verify_trace_signature.circom";

// l: trace length
template SettleTrace(l) {
    var i;
    var j; 
    
    var commitmentBytesWidth = 32;
    var balanceBytesWidth = 16; // uint128:[u8;16]
    var serviceNameBytesWidth = 32; // string:[u8;32]
    var servicePriceBytesWidth = 4; // uint32:[u8;4]
    var countBytesWidth = 4; // uint32:[u8;4]
    var addressBytesWidth = 20; // unit160:[u8;20]
    var nonceBytesWidth = 4; // unit32:[u8;4]
    var priceTableLen = 3;
    var numBits = 8; // pubkey bits per chunk
    // var k = 32; // pubkey chunks
    
    // request content
    // every settlment just process one account, so the pubkey should be same
    // ecdsa
    signal input reqPubkey[2][32];
    // eddsa
    // signal input reqPubkey[32];
    signal input reqNonce[l][nonceBytesWidth];
    signal input reqServiceName[serviceNameBytesWidth]; // string:uint256
    signal input reqInputCount[l][countBytesWidth];
    signal input reqOutputCount[l][countBytesWidth];
    // signal input createdAt[l];
    signal input r[l][32];
    signal input s[l][32];


    // verify signature
    component sigVerifier = TraceSignatureVerify(l);
    sigVerifier.pubkeyBytes <== reqPubkey;
    sigVerifier.serviceNameBytes <== reqServiceName;
    sigVerifier.inputCountBytes <== reqInputCount;
    sigVerifier.outputCountBytes <== reqOutputCount;
    sigVerifier.nonceBytes <== reqNonce;
    sigVerifier.rBytes <== r;
    sigVerifier.sBytes <== s;


    // account content
    // every settlment just process one account
    signal input accUserAddress[addressBytesWidth]; 
    signal input accProviderAddress[addressBytesWidth]; 
    signal input accNonce[nonceBytesWidth]; 
    signal input accBalance[balanceBytesWidth]; 
    
    // calculate init account commitment
    component accountCommit = AccountCommit();
    accountCommit.userAddress <== accUserAddress;
    accountCommit.providerAddress <== accProviderAddress;
    accountCommit.nonce <== accNonce;
    accountCommit.balance <== accBalance;
    signal output old_commitment[commitmentBytesWidth];
    old_commitment <== accountCommit.commitment;

    // check pubkey and address are mathched    
    // ecdsa
    component pubToAddr = PubkeyToAddress();
    pubToAddr.pubkeyBytes <== reqPubkey;
    pubToAddr.address === accUserAddress;

    // check nonce is valid
    component checkNonceeTrace = NonceTraceCheck(l);
    checkNonceeTrace.nonce <== reqNonce;
    checkNonceeTrace.initNonce <== accNonce;

    // check balance trace is valid
    component checkBalanceTrace = BalanceTraceCheck(l);
    signal input priceTableKeys[priceTableLen][serviceNameBytesWidth];
    signal input priceTableValues[priceTableLen][servicePriceBytesWidth];
    checkBalanceTrace.tableKeys <== priceTableKeys;
    checkBalanceTrace.tableValues <== priceTableValues;
    checkBalanceTrace.serviceName <== reqServiceName;
    checkBalanceTrace.inputCount <== sigVerifier.inputCount;
    checkBalanceTrace.outputCount <== sigVerifier.outputCount;
    checkBalanceTrace.initBalance <== accBalance;
    signal output servicePriceTableCommitment[commitmentBytesWidth];
    servicePriceTableCommitment <== checkBalanceTrace.priceTableCommitment;

    // update commitment
    signal new_commitment[commitmentBytesWidth];
    component newAccountCommit = AccountCommit();
    newAccountCommit.userAddress <== accUserAddress;
    newAccountCommit.providerAddress <== accProviderAddress;
    newAccountCommit.nonce <== checkNonceeTrace.finalNonce;
    newAccountCommit.balance <== checkBalanceTrace.finalBalance;
    new_commitment <== newAccountCommit.commitment;
}

component main = SettleTrace(1);