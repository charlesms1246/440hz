pragma circom 2.0.0;

include "../settle_eddsa.circom";

component main {public [signer]} = SettleTrace(4);

