import {test} from 'node:test';
import assert from 'node:assert/strict';
import {runtimeReadiness} from '../../src/lib/commerce/readiness';
import {paymentCopy,enabledPaymentMethods} from '../../src/lib/commerce/payment-methods';
test('readiness does not accept mismatched provider evidence or missing runtime keys',()=>{
 const missing=runtimeReadiness({});assert(Object.values(missing).every(v=>v===false));
 const mismatched=runtimeReadiness({NEXT_PUBLIC_PAYMENT_METHODS:'CARD_AND_BANK_TRANSFER',PAYMENT_ACCEPTANCE_CONFIRMED:'CARD_ONLY'});
 assert.equal(mismatched.payment_methods,true);assert.equal(mismatched.provider_acceptance,false);
});
test('method copy makes no transfer promise without explicit enabled set',()=>{
 assert.deepEqual(enabledPaymentMethods(undefined),[]);
 assert.equal(paymentCopy('CARD_ONLY'),'Tarjeta');
 assert.equal(paymentCopy(undefined),'Métodos de pago por confirmar');
 assert.equal(paymentCopy('CARD_AND_BANK_TRANSFER'),'Tarjeta · Transferencia bancaria');
});
