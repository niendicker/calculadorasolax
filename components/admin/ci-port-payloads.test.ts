import {it,expect} from 'vitest';
import {buildCiInverterPayload,buildInverterPayload} from './save-payloads';
it('persists four physical C&I ports without changing residential payload limits',()=>{
 const physical={model:'PCS quatro portas',battery_ports:4};
 expect(buildCiInverterPayload(physical).battery_ports).toBe(4);
 expect(buildInverterPayload(physical).battery_ports).toBe(2);
});
