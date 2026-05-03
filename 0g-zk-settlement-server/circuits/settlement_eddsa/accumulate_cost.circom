pragma circom 2.0.0;


template CostAccumulate(traceLen) {
    var i;

    signal input fee[traceLen];
    signal feeAccumulator[traceLen];

    feeAccumulator[0] <== fee[0]; 

    for (i=1; i<traceLen; i++) {
        feeAccumulator[i] <== feeAccumulator[i-1] + fee[i];
    }

    signal c;
    c <-- 1;
    signal output totalFee;
    totalFee <== (feeAccumulator[traceLen - 1]) * c;
}