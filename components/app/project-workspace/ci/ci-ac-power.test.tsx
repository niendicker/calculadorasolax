// @vitest-environment jsdom
import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { CiAcPowerFactorInput } from './ci-ac-power';

it('allows incomplete FP typing without publishing zero or invalid factors', () => {
  const changed=vi.fn();
  function Form(){const [value,setValue]=useState(1);return <CiAcPowerFactorInput label="FP CA" value={value} onChange={factor=>{setValue(factor);changed(factor);}}/>;}
  render(<Form/>);
  const field=screen.getByLabelText('FP CA');
  fireEvent.change(field,{target:{value:'0'}});
  expect(changed).not.toHaveBeenCalled();
  fireEvent.change(field,{target:{value:'0.8'}});
  expect(changed).toHaveBeenLastCalledWith(.8);
  fireEvent.change(field,{target:{value:'2'}});
  fireEvent.blur(field);
  expect(field).toHaveValue(.8);
  expect(changed).toHaveBeenCalledTimes(1);
});
