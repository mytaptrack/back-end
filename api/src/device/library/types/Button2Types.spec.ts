import { ClickType } from './Button2Types';

it('ClickType matches the values devices send', () => {
  expect(ClickType).toEqual({ click: 'click', hold: 'hold' });
});
