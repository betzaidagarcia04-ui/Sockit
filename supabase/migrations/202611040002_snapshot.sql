create or replace function public.sockit_snapshot() returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 with sales as (select coalesce(sum(total),0) revenue,coalesce(sum(cogs),0) cogs from documents where kind='sale' and status='active'),
 purchases as (select coalesce(sum(total),0) total from documents where kind='purchase' and status='active'),
 money as (select
 coalesce(sum(amount) filter(where account='cash'),0) cash,
 coalesce(sum(amount) filter(where account='bank'),0) bank,
 -coalesce(sum(amount) filter(where kind='expense'),0) expenses,
 coalesce(sum(amount) filter(where kind='capital'),0) capital,
 -coalesce(sum(amount) filter(where kind='withdrawal'),0) withdrawals,
 -coalesce(sum(amount) filter(where kind='purchase'),0) purchases_paid,
 coalesce(sum(amount) filter(where kind in ('collection','refund')),0) collections
 from cash_movements),
 inventory as (select coalesce(sum(stock*average_cost),0) value,coalesce(sum(stock),0) pairs,count(*) filter(where active and stock<=minimum) low_stock from products)
 select jsonb_build_object(
 'products',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from products p),'[]'::jsonb),
 'documents',coalesce((select jsonb_agg(to_jsonb(d) order by d.created_at desc) from documents d),'[]'::jsonb),
 'payments',coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc) from payments p),'[]'::jsonb),
 'movements',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from cash_movements m),'[]'::jsonb),
 'inventory_movements',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc) from inventory_movements m),'[]'::jsonb),
 'lines',coalesce((select jsonb_agg(to_jsonb(l)) from document_lines l),'[]'::jsonb),
 'metrics',jsonb_build_object('revenue',s.revenue,'cogs',s.cogs,'gross_profit',s.revenue-s.cogs,
 'net_profit',s.revenue-s.cogs-m.expenses,'cash',m.cash,'bank',m.bank,'expenses',m.expenses,
 'capital',m.capital,'withdrawals',m.withdrawals,'collections',m.collections,
 'receivables',s.revenue-m.collections,'payables',p.total-m.purchases_paid,
 'inventory_value',i.value,'pairs',i.pairs,'low_stock',i.low_stock,
 'equity',m.cash+m.bank+i.value+s.revenue-m.collections-(p.total-m.purchases_paid))
 ) from sales s cross join purchases p cross join money m cross join inventory i;
$$;
revoke all on function public.sockit_snapshot() from public,anon;
grant execute on function public.sockit_snapshot() to authenticated;
