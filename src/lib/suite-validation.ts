import { z } from 'zod';
const text=z.string().max(5000),short=z.string().max(160),uuid=z.uuid(),optionalId=uuid.or(z.literal('')).optional();
const money=z.number().finite().nonnegative().max(999999999),positive=money.positive();
const date=z.iso.date();
const client=z.object({name:short.trim().min(1),phone:z.string().max(40),age_range:z.enum(['unknown','under18','18-24','25-34','35-44','45-54','55+']),province:short,city:short,municipality:short,sector:short,address:text,notes:text,latitude:z.number().min(17.4).max(20.1).nullable(),longitude:z.number().min(-72.1).max(-68).nullable(),active:z.boolean()});
const supplier=z.object({name:short.trim().min(1),phone:short,email:short,notes:text,active:z.boolean()});
const bank=z.object({name:short.trim().min(1),institution:short.trim().min(1),holder:short.trim().min(1),account_type:short,account_number:z.string().max(40),active:z.boolean()});
const productRow=z.object({sku:z.string().trim().min(1).max(60),name:short.trim().min(1),category:short,color:short,size:short,price:money,minimum:z.number().int().nonnegative().max(1000000)});
export const operationExtras=z.object({account_id:optionalId,client_id:optionalId,supplier_id:optionalId,due_date:date.or(z.literal('')).optional(),photo_id:optionalId,photo_ids:z.array(uuid).max(12).optional(),collection:short.optional(),sock_type:short.optional(),brand:short.optional(),method:z.string().min(1).max(80).optional(),origin_bank:short.optional(),receipt_id:optionalId,fee:money.optional(),expense_category:short.optional(),discount:money.optional(),delivery_charge:money.optional()});
export const suiteSchemas:Record<string,z.ZodType>={
 client,edit_client:client.extend({id:uuid}),supplier,edit_supplier:supplier.extend({id:uuid}),
 bank_account:bank,edit_bank_account:bank.extend({id:uuid}),
 bank_transfer:z.object({account_id:optionalId,target_account_id:optionalId,amount:positive,description:short.min(1)}),
 reconcile:z.object({account_id:uuid,statement_date:date,statement_balance:z.number().finite().min(-999999999).max(999999999),notes:text.min(1),movement_ids:z.array(uuid).max(10000)}),
 catalog:z.object({kind:z.enum(['bank','location','payment_method','category','expense_category']),label:short.trim().min(1),active:z.boolean()}),
 settings:z.object({name:short.trim().min(1),payment_message:text.min(1),delivery_message:text.min(1),privacy_minimum:z.number().int().min(3).max(100)}),
 read_notification:z.object({event_key:z.string().min(1).max(250)}),
 order:z.object({client_id:uuid,delivery_date:date,delivery_method:short.min(1),address:text,notes:text,delivery_cost:money,discount:money,lines:z.array(z.object({product_id:uuid,quantity:z.number().int().positive().max(1000000),unit_price:money})).min(1).max(100)}),
 order_status:z.object({order_id:uuid,status:z.enum(['new','confirmed','preparing','ready','sent','delivered','cancelled','returned']),notes:text.optional()}),
 order_payment:z.object({order_id:uuid,amount:positive,account:z.enum(['cash','bank']),account_id:optionalId,method:z.string().min(1).max(80),reference:short,origin_bank:short,fee:money,receipt_id:optionalId}),
 import_products:z.object({rows:z.array(productRow).min(1).max(500)}),
 import_purchase:z.object({contact:short.min(1),rows:z.array(z.object({sku:z.string().min(1),quantity:z.number().int().positive().max(1000000),unit_price:money})).min(1).max(500)}),
 presentation:z.object({name:short.min(1),lines:z.array(z.object({product_id:uuid,quantity:z.number().int().positive().max(1000000),unit_price:money})).min(1).max(100)}),
 edit_presentation:z.object({id:uuid,name:short.min(1),active:z.boolean(),lines:z.array(z.object({product_id:uuid,quantity:z.number().int().positive().max(1000000),unit_price:money})).min(1).max(100)}),
 sale_return:z.object({document_id:uuid,description:text.min(1),lines:z.array(z.object({product_id:uuid,quantity:z.number().int().positive().max(1000000)})).min(1).max(100)}),
 file:z.object({id:uuid,name:short,mime:z.enum(['image/png','image/jpeg','image/webp','application/pdf']),size:z.number().int().positive().max(5242880),purpose:z.enum(['product','receipt']),sha256:z.string().regex(/^[a-f0-9]{64}$/)}),
};

suiteSchemas.edit_order=(suiteSchemas.order as z.ZodObject).extend({id:uuid});
suiteSchemas.bank_adjustment=z.object({account_id:uuid,amount:z.number().finite().min(-999999999).max(999999999).refine(n=>n!==0),description:text.min(1)});
