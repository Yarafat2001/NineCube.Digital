import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { API, order, staffUser, adminUser, problem } from './handlers';
import { server } from './server';
import { renderApp, seedSession } from './utils';
import type { Order } from '../api/types';
let rows: Order[];
beforeEach(()=>{
 rows=[{...order,id:500,status:'Pending'},{...order,id:501,status:'Pending'},{...order,id:502,status:'Confirmed'},{...order,id:503,status:'Shipped'}];
 seedSession('Staff');server.use(http.get(`${API}/api/auth/me`,()=>HttpResponse.json(staffUser)),http.get(`${API}/api/orders`,({request})=>{const status=new URL(request.url).searchParams.get('status');const items=status?rows.filter(o=>o.status===status):rows;return HttpResponse.json({items,page:1,pageSize:10,totalCount:items.length,totalPages:1,hasNext:false,hasPrevious:false});}));
});
async function mount(){const user=userEvent.setup();renderApp('/staff');await screen.findByRole('checkbox',{name:'Select order #500'},{timeout:30000});return user;}
describe('Bulk order state updates',()=>{
 it('keeps administrator order access read-only without posting forbidden mutations',async()=>{
  let posts=0;seedSession('Administrator');
  server.use(http.get(`${API}/api/auth/me`,()=>HttpResponse.json(adminUser)),http.post(`${API}/api/orders/:id/:verb`,()=>{posts++;return HttpResponse.json(order);}));
  const user=userEvent.setup();renderApp('/staff');
  await screen.findByRole('link',{name:'View invoice for order #503'});
  expect(screen.getByRole('note')).toHaveTextContent('Administrator order access is read-only');
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button',{name:'To confirm'}));
  await screen.findByRole('link',{name:'View invoice for order #500'});
  expect(screen.queryByRole('button',{name:'Confirm order'})).not.toBeInTheDocument();
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Manage categories'})).toBeEnabled();expect(posts).toBe(0);
 });

 it('classifies processing queues and keeps invoices consistent across all states',async()=>{
  const user=await mount();
  expect(screen.queryByRole('region',{name:'Order status workflow'})).not.toBeInTheDocument();
  expect(screen.getByRole('columnheader',{name:'Invoice'})).toBeVisible();
  expect(screen.queryByRole('checkbox',{name:'Select order #502'})).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox',{name:'Select all pending orders on this page'}));
  expect(screen.getByText('2 selected on this page')).toBeVisible();
  expect(screen.getByLabelText('Action')).toHaveValue('confirm');
  expect(within(screen.getByLabelText('Action')).queryByRole('option',{name:'Mark as shipped'})).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox',{name:'Select order #501'}));
  expect(screen.getByRole('checkbox',{name:'Select all pending orders on this page'})).toBePartiallyChecked();
  await user.click(screen.getByRole('button',{name:'To ship'}));
  await screen.findByRole('checkbox',{name:'Select order #502'});
  expect(screen.queryByLabelText('Action')).not.toBeInTheDocument();
  await user.click(screen.getByRole('checkbox',{name:'Select all confirmed orders on this page'}));
  expect(screen.getByLabelText('Action')).toHaveValue('ship');
  await user.click(screen.getByRole('button',{name:'Invoices & history'}));
  await screen.findByRole('link',{name:'View invoice for order #503'});
  expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  expect(screen.getAllByRole('link',{name:/View invoice for order/})).toHaveLength(4);
  expect(screen.queryByRole('columnheader',{name:'Update status'})).not.toBeInTheDocument();
 });
 it('reviews selected orders, prevents duplicate submission and reports partial failures',async()=>{
  const calls:string[]=[];
  server.use(http.post(`${API}/api/orders/:id/:verb`,async({params})=>{
   calls.push(`${params.id}/${params.verb}`);await new Promise(r=>setTimeout(r,20));
   if(params.id==='501') return HttpResponse.json(problem(409,'invalid_order_state','Conflict','Order changed state before this update.'),{status:409});
   rows=rows.map(row=>row.id===Number(params.id)?{...row,status:'Confirmed'}:row);return HttpResponse.json(rows.find(row=>row.id===Number(params.id)));
  }));
  const user=await mount();await user.click(screen.getByRole('checkbox',{name:'Select order #500'}));await user.click(screen.getByRole('checkbox',{name:'Select order #501'}));
  await user.selectOptions(screen.getByLabelText('Action',{exact:true}),'confirm');await user.click(screen.getByRole('button',{name:'Review bulk update'}));
  const dialog=screen.getByRole('dialog',{name:'Review bulk order update'});
  expect(dialog).toHaveTextContent('Order #500 - Pending');expect(dialog).toHaveTextContent('Order #501 - Pending');expect(calls).toHaveLength(0);
  const apply=within(dialog).getByRole('button',{name:'Apply bulk update'});fireEvent.click(apply);fireEvent.click(apply);
  await screen.findByText('1 updated; 1 failed.');expect(calls).toEqual(['500/confirm','501/confirm']);expect(screen.getByText(/Order #501:.*changed state/)).toBeInTheDocument();
 });
 it('never sends updates when the review is cancelled',async()=>{
  let posts=0;server.use(http.post(`${API}/api/orders/:id/:verb`,()=>{posts++;return HttpResponse.json(order);}));
  const user=await mount();await user.click(screen.getByRole('button',{name:'To ship'}));await user.click(await screen.findByRole('checkbox',{name:'Select order #502'}));await user.selectOptions(screen.getByLabelText('Action',{exact:true}),'ship');await user.click(screen.getByRole('button',{name:'Review bulk update'}));
  await user.click(within(screen.getByRole('dialog',{name:'Review bulk order update'})).getByRole('button',{name:'Back'}));expect(posts).toBe(0);
 });
});
