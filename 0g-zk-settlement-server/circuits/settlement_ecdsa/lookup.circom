pragma circom 2.0.0;

template Lookup(n) {
    signal input key[n];
    signal input value[n];
    
    signal input targetKey;
    
    // 中间变量
    signal term[n][n];
    signal q[n][n];

    // 计算拉格朗日基函数的值
    for (var i = 0; i < n; i++) {
        if (i > 0) {
            q[i][0] <-- (targetKey - key[0]) / (key[i] - key[0]);
            q[i][0] * (key[i] - key[0]) === (targetKey - key[0]);
        } else {
            q[i][0] <== 1;
        }
        term[i][0] <== q[i][0];
        for (var j = 1; j < n; j++) {
            if (j != i) {
                q[i][j] <-- (targetKey - key[j]) / (key[i] - key[j]);
                q[i][j] * (key[i] - key[j]) === (targetKey - key[j]);
                term[i][j] <== term[i][j-1] * q[i][j];
            } else {
                term[i][j] <== term[i][j-1];
            }
        }
    }
    
    signal targetValueTemp[n];
    targetValueTemp[0] <== term[0][n-1] * value[0];
    for (var i = 1; i < n; i++) {
        targetValueTemp[i] <-- targetValueTemp[i-1] + term[i][n-1] * value[i];
    }
    signal output targetValue;
    targetValue <== targetValueTemp[n-1];
}