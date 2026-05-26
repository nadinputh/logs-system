import { z } from 'zod'

export const QuestStepSchema = z.object({
  order: z.number().int().min(0),
  locationId: z.string().min(1),
  locationType: z.enum(['building', 'floor', 'room']),
  challenge: z.string().optional(),
})

export const CreateQuestCardSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  type: z.enum(['location_chain', 'custom']),
  steps: z.array(QuestStepSchema).min(1),
  parentQuestId: z.string().optional(),
  count: z.number().int().min(1).max(200).default(1),
})

export const QuestProgressSchema = z.object({
  locationId: z.string().min(1),
  locationType: z.enum(['building', 'floor', 'room']),
  sessionToken: z.string().uuid(),
})

export type CreateQuestCardInput = z.infer<typeof CreateQuestCardSchema>
export type QuestProgressInput = z.infer<typeof QuestProgressSchema>
