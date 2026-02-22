import { z } from 'zod';

export const RoleSchema = z.enum(['SUPER_ADMIN', 'TENANT_ADMIN', 'AGENT', 'BUYER']);
export type Role = z.infer<typeof RoleSchema>;

export const PropertyStatusSchema = z.enum(['DRAFT', 'LIVE', 'UNDER_OFFER', 'SOLD']);
export const BiddingModeSchema = z.enum(['SEALED', 'OPEN']);
export const LeadStatusSchema = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'VIEWING_BOOKED', 'OFFER_MADE', 'CLOSED_WON', 'CLOSED_LOST']);
export const ReminderChannelSchema = z.enum(['IN_APP', 'PUSH']);

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantId: z.string().uuid().optional(),
});

export const RegisterSchema = z.object({
  tenantId: z.string().uuid(),
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
  role: RoleSchema.default('BUYER'),
});

export const PropertyInputSchema = z.object({
  title: z.string().min(3),
  address: z.string().min(3),
  eircode: z.string().optional(),
  description: z.string().min(3),
  priceGuide: z.number().nonnegative(),
  minimumOffer: z.number().nonnegative().nullable().optional(),
  status: PropertyStatusSchema.default('DRAFT'),
  biddingMode: BiddingModeSchema,
  biddingDeadline: z.string().datetime().optional(),
  assignedAgentId: z.string().uuid().optional(),
  minIncrement: z.number().int().positive().default(1000),
});

export const BidInputSchema = z.object({
  amount: z.number().positive(),
});

export const AppointmentRequestSchema = z.object({
  propertyId: z.string().uuid(),
  preferredStart: z.string().datetime(),
  preferredEnd: z.string().datetime(),
  note: z.string().max(500).optional(),
});

export const LeadInputSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(6).optional(),
  source: z.string().min(1).optional(),
  budgetMin: z.number().nonnegative().optional(),
  budgetMax: z.number().nonnegative().optional(),
  status: LeadStatusSchema.default('NEW'),
  assignedAgentId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  nextFollowUpAt: z.string().datetime().optional(),
});

export const LeadNoteInputSchema = z.object({
  body: z.string().min(1).max(2000),
});

export const ReminderInputSchema = z.object({
  title: z.string().min(1).max(140),
  body: z.string().max(1000).optional(),
  dueAt: z.string().datetime(),
  channel: ReminderChannelSchema.default('IN_APP'),
  leadId: z.string().uuid().optional(),
  propertyId: z.string().uuid().optional(),
  appointmentId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
});

export type PropertyInput = z.infer<typeof PropertyInputSchema>;
export type BidInput = z.infer<typeof BidInputSchema>;
export type AppointmentRequestInput = z.infer<typeof AppointmentRequestSchema>;
export type LeadInput = z.infer<typeof LeadInputSchema>;
export type LeadNoteInput = z.infer<typeof LeadNoteInputSchema>;
export type ReminderInput = z.infer<typeof ReminderInputSchema>;
