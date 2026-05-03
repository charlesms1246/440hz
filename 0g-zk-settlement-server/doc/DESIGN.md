# Design
## Single request
The request contains the following metadata such as:

1. nonce
2. service_type
3. user_addressand  
4. ...

The request is signed by the user. 
For each settlement of a request, the content of the request needs to meet the following assertions，here called _the_ _content check_:

1. signature.valid == true
2. request.nonce == user_address.nonce + 1
3. service_type.price <= user_address.balance
4. user_address.balance -= service_type.inputPrice * request.inputCount  + service_type.outputPrice * request.ouputCount 
5. server_address == server_address<circuit's public input>
6. server_address.balance += service_type.inputPrice * request.inputCount  + service_type.outputPrice * request.ouputCount 
7.  service_type.updatedAt < request.createdAt

Therefore, the server as the prover needs to prove that these assertions hold. Additionally, considering data visibility, where the verification nodes as verifiers cannot see the request and its signature, what the prover needs to prove should be expanded to:
_From the server perspective, he/she want to settle a request:_

1. _The signature of the request can be successfully verified using the pubkey corresponding to the user_address in the request;_
2. _I'm the server recorded in the request;_
3. _The nonce in the request is valid;_
4. _The balance of user_address is not less than the fee calculated from the count and the price corresponding to service_type in the request;_
5. _In the new state, the balance reduction fee for user_address is correct;_
6. _In the new state, the balance increase fee for server_address is correct;_

![image.png](./images/‎0G%20zkSettlement.‎003.png)
The above 6 assertions from the server perspective include the following issues that need to be solved in addition to _the content check_.

1. How to obtain user_address.balance in the circuit through user_address?
2. How to obtain the account's nonce in the circuit through user_address?
3. How to obtain the pubkey in the circuit through user_address?
4. How to obtain the service's price in the circuit through service_type?

For issues 1 and 2, I believe a commit scheme should be added to organize the account information, form a commitment, and store it in the contract~~, such as a simple Merkle tree or a more efficient Verkle tree. Here is to use a Merkle tree~~. (In the new scheme, only need to commit the account, and there is no need to organize all the accounts into merkel tree.)
As shown in step 2, the server~~ downloads the aux data for calculating the path from the chain and then~~ proves that the content of the request can correctly calculate the same target commitment.
![image.png](./images/‎0G%20zkSettlement.‎004.png)
For issues 3 and 4, as shown in step 3, mappings can be implemented using lookup. Lookup can be implemented using the plookup algorithm or by interpolating the mappings into polynomials. The former is more suitable for sparse user_address, while the latter is more suitable for service_type.
Once these issues are resolved, as shown in step 4, the validity of the signature and as shown in step 5, the correctness of the state transition (_that is, the previous content check and the new target commitment computation_) can be further proven. 
After the proof is verified, as shown in step 6, the account state and server balance recorded on the chain can be changed.
## Request trace
For request trace, it is easy to extend _the content check_ to prove the settlement of request trace.