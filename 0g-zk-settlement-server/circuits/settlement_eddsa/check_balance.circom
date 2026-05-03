pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/bitify.circom";
include "../../node_modules/circomlib/circuits/comparators.circom";
include "../hasher/pedersen_bytes.circom";
include "./accumulate_cost.circom";

template BalanceCheck(traceLen) {
    var i;
    
    signal input fee[traceLen];

    // calculate total cost
    component costAccumulator = CostAccumulate(traceLen);
    costAccumulator.fee <== fee;
    
    signal output totalFee;
    totalFee <== costAccumulator.totalFee;
}
