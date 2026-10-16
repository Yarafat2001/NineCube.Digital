import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SalesCharts } from '../components/SalesCharts';
import type { SalesSummary } from '../api/types';
const data: SalesSummary = {currency:'BDT',from:'2026-10-01',to:'2026-10-15',totalOrders:4,totalRevenue:150,byStatus:[
  {status:'Confirmed',orderCount:2,revenue:150,percentage:50},
  {status:'Cancelled',orderCount:1,revenue:0,percentage:25},
  {status:'Rejected',orderCount:1,revenue:0,percentage:25}
]};
describe('Sales charts',()=>{
 it('charts actual order counts while retaining zero revenue for cancelled/rejected orders',()=>{
  const {container}=render(<SalesCharts data={data}/>);
  expect(screen.getByRole('img')).toHaveAccessibleName('Confirmed: 2 orders, Cancelled: 1 orders, Rejected: 1 orders');
  const legend=screen.getByRole('list',{name:'Order distribution values'});
  expect(within(legend).getAllByRole('listitem')[0]).toHaveTextContent('Confirmed250.0%');
  const rows=screen.getByRole('list',{name:'Revenue by status values'});
  expect(within(rows).getAllByRole('listitem')[0]).toHaveTextContent('BDT 150.00');
  expect(container.querySelector('.sales-revenue [data-status="Cancelled"] .sales-revenue__track > span')).toHaveStyle({width:'0%'});
  expect(container.querySelector('.sales-revenue [data-status="Confirmed"] .sales-revenue__track > span')).toHaveStyle({width:'100%'});
  const segments=container.querySelectorAll('.sales-donut__segment');
  expect(Array.from(segments).reduce((sum,el)=>sum+parseFloat(el.getAttribute('stroke-dasharray')!),0)).toBe(100);
 });
 it('shows honest empty states without invalid or invented chart values',()=>{
  const {container}=render(<SalesCharts data={{...data,totalOrders:0,totalRevenue:0,byStatus:data.byStatus.map(row=>({...row,orderCount:0,revenue:0,percentage:0}))}}/>);
  expect(screen.getByRole('img')).toHaveAccessibleName('No orders in this date range');
  expect(screen.getByText('No revenue for the selected range and currency.')).toBeVisible();
  expect(container.querySelectorAll('.sales-donut__segment')).toHaveLength(0);
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
 });
 it('labels revenue with the selected report currency',()=>{
  render(<SalesCharts data={{...data,currency:'USD'}}/>);
  expect(screen.getByText('USD 150.00')).toBeVisible();
  expect(screen.queryByText('BDT 150.00')).not.toBeInTheDocument();
 });
});
