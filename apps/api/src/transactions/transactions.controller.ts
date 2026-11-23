import { Controller, Delete, Get, HttpCode, Param, Patch, Post, UnsupportedMediaTypeException, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import {
  ConfirmImportSchema, CreateTransactionSchema, ImportConfirmOut, ImportCsvBodySchema, ImportPreviewOut, MAX_CSV_BYTES, ReceiptUploadOut,
  ReceiptUploadSchema, TransactionCreatedOut, TransactionOut, TransactionQuerySchema, TransferSchema, UpdateTransactionSchema,
} from '@smartwallet/shared';
import { CurrentUser } from '../common/current-user.decorator';
import { AuthUser, JwtAuthGuard } from '../common/jwt-auth.guard';
import { Owned, OwnershipGuard } from '../common/ownership.guard';
import { PlanLimitGuard, PremiumOnly } from '../common/plan-limit.guard';
import { ApiData, ApiErrors, ApiNoContent, ZBody, ZQuery } from '../common/swagger';
import { ImportService } from './import.service';
import { ListQuery, TransactionsService } from './transactions.service';

const IdParam = ApiParam({ name: 'id', format: 'uuid' });
const CSV_TYPES = ['text/csv', 'application/csv', 'application/vnd.ms-excel', 'text/plain', 'application/octet-stream'];

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, OwnershipGuard, PlanLimitGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private svc: TransactionsService, private imports: ImportService) {}

  @Get()
  @ApiOperation({ summary: 'TXN-03: list with filters (date range, type, wallet, category, min/max amount, keyword), pagination and sort' })
  @ApiData(TransactionOut, { list: true })
  @ApiErrors(400, 401)
  list(@CurrentUser() u: AuthUser, @ZQuery(TransactionQuerySchema) q: ListQuery) {
    return this.svc.list(u, q);
  }

  @Post()
  @ApiOperation({ summary: 'TXN-01: create an income or expense (optional receiptKey from /receipts/upload-url). triggeredAlerts lists budget alerts this expense just caused' })
  @ApiData(TransactionCreatedOut, { status: 201 })
  @ApiErrors(400, 401, 404, 409, 422)
  create(@CurrentUser() u: AuthUser, @ZBody(CreateTransactionSchema) dto: any) {
    return this.svc.create(u, dto);
  }

  @Post('transfer')
  @ApiOperation({ summary: 'TXN-02: move money between two wallets (not income or expense)' })
  @ApiData(TransactionOut, { status: 201 })
  @ApiErrors(400, 401, 404, 409)
  transfer(@CurrentUser() u: AuthUser, @ZBody(TransferSchema) dto: any) {
    return this.svc.transfer(u, dto);
  }

  @Post('receipts/upload-url')
  @ApiOperation({ summary: 'TXN-01: pre-signed S3 POST for a receipt image (max 5 MB, jpeg/png/webp, private bucket)' })
  @ApiData(ReceiptUploadOut, { status: 201 })
  @ApiErrors(400, 401, 501)
  receiptUpload(@CurrentUser() u: AuthUser, @ZBody(ReceiptUploadSchema) dto: any) {
    return this.svc.createReceiptUpload(u, dto);
  }

  @Post('import')
  @PremiumOnly('csv_import')
  @HttpCode(200)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_CSV_BYTES, files: 1 } }))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', required: ['file', 'walletId'], properties: { file: { type: 'string', format: 'binary', description: 'CSV, max 2 MB / 5000 rows. Columns: date, amount, note, type, category' }, walletId: { type: 'string', format: 'uuid' } } } })
  @ApiOperation({ summary: 'TXN-06 (Premium): upload a CSV and get a preview with duplicate flags. Nothing is saved until confirm.' })
  @ApiData(ImportPreviewOut)
  @ApiErrors(400, 401, 403, 404, 409, 422)
  importCsv(@CurrentUser() u: AuthUser, @ZBody(ImportCsvBodySchema, { multipart: true }) body: { walletId: string }, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new UnsupportedMediaTypeException({ code: 'FILE_REQUIRED', message: 'Send the CSV as multipart field "file"' });
    if (!CSV_TYPES.includes(file.mimetype) || !/[.]csv$/i.test(file.originalname)) {
      throw new UnsupportedMediaTypeException({ code: 'INVALID_FILE_TYPE', message: 'Only .csv files are accepted' });
    }
    return this.imports.preview(u, body.walletId, file);
  }

  @Post('import/:importId/confirm')
  @PremiumOnly('csv_import')
  @HttpCode(200)
  @ApiParam({ name: 'importId', format: 'uuid' })
  @ApiOperation({ summary: 'TXN-06 (Premium): save the previewed rows in one DB transaction (duplicates skipped unless includeDuplicates)' })
  @ApiData(ImportConfirmOut)
  @ApiErrors(400, 401, 403, 404, 409)
  confirmImport(@CurrentUser() u: AuthUser, @Param('importId') importId: string, @ZBody(ConfirmImportSchema) dto: any) {
    return this.imports.confirm(u, importId, dto);
  }

  @Get(':id')
  @Owned('transaction')
  @IdParam
  @ApiOperation({ summary: 'Get one transaction' })
  @ApiData(TransactionOut)
  @ApiErrors(401, 404)
  get(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.get(u, id);
  }

  @Patch(':id')
  @Owned('transaction')
  @IdParam
  @ApiOperation({ summary: 'TXN-04: edit (balances and budgets recalculate). Transfers allow only amount, note, occurredAt.' })
  @ApiData(TransactionOut)
  @ApiErrors(400, 401, 404, 409, 422)
  update(@CurrentUser() u: AuthUser, @Param('id') id: string, @ZBody(UpdateTransactionSchema) dto: any) {
    return this.svc.update(u, id, dto);
  }

  @Delete(':id')
  @Owned('transaction')
  @HttpCode(204)
  @IdParam
  @ApiOperation({ summary: 'TXN-04: soft-delete (balances recalculate)' })
  @ApiNoContent()
  @ApiErrors(401, 404)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.svc.remove(u, id);
  }
}
