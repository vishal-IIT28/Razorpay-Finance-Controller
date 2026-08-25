import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import multer from 'multer';
import Papa from 'papaparse';
import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { runDeterministicPass, RzpRecord, BankRecord, LedgerRecord } from './engine/deterministic';
import { runFuzzyPass } from './engine/fuzzy';
dotenv.config();

const app = express();
const port = process.env.PORT || 3001;
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// Setup multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Basic health check route
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', message: 'FinReconcile API is running' });
});

// Endpoint to handle CSV uploads and start reconciliation
app.post(
  '/api/reconcile',
  upload.fields([
    { name: 'razorpay', maxCount: 1 },
    { name: 'bank', maxCount: 1 },
    { name: 'ledger', maxCount: 1 },
  ]),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const files = req.files as { [fieldname: string]: Express.Multer.File[] };

      if (!files['razorpay'] || !files['bank'] || !files['ledger']) {
        res.status(400).json({ error: 'Missing one or more required files (razorpay, bank, ledger)' });
        return;
      }

      // Read and parse files
      const parseCSV = (filePath: string) => {
        const fileContent = fs.readFileSync(filePath, 'utf-8');
        const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
        return parsed.data;
      };

      const razorpayData = parseCSV(files['razorpay'][0].path);
      const bankData = parseCSV(files['bank'][0].path);
      const ledgerData = parseCSV(files['ledger'][0].path);

      // Clean up uploaded files
      fs.unlinkSync(files['razorpay'][0].path);
      fs.unlinkSync(files['bank'][0].path);
      fs.unlinkSync(files['ledger'][0].path);

      // Pass 1: Deterministic Matching
      const pass1Result = runDeterministicPass(
        razorpayData as RzpRecord[],
        bankData as BankRecord[],
        ledgerData as LedgerRecord[]
      );

      // Pass 2: Fuzzy Matching
      const pass2Result = runFuzzyPass(
        pass1Result.unmatched.razorpay,
        pass1Result.unmatched.bank,
        pass1Result.unmatched.ledger
      );

      // TODO: Pass 3 (LLM) Logic here
      const allMatches = [...pass1Result.matches, ...pass2Result.matches];
      const totalMatched = allMatches.length;
      const matchRate = ((totalMatched / razorpayData.length) * 100).toFixed(1);

      res.json({
        message: 'Reconciliation Passes 1 & 2 completed.',
        summary: {
          total_records: razorpayData.length,
          total_matched: totalMatched,
          match_rate_pct: parseFloat(matchRate),
          exceptions: pass2Result.unmatched.razorpay.length,
        },
        pass1: {
          matched: pass1Result.matches.length,
        },
        pass2: {
          matched: pass2Result.matches.length,
          unmatched_remaining: pass2Result.unmatched.razorpay.length,
        },
        matches: allMatches,
        exceptions: pass2Result.unmatched.razorpay.map((r) => ({
          payment_id: r.payment_id,
          amount: r.amount,
          status: r.status,
          created_at: r.created_at,
          reason: 'Could not match in Pass 1 or 2 — escalated for LLM review.',
        })),
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal server error during processing' });
    }
  }
);

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});
