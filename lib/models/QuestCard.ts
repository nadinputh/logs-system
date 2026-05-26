import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface IQuestStep {
  order: number
  locationId: Types.ObjectId
  locationType: 'building' | 'floor' | 'room'
  challenge?: string
}

export interface IQuestCard extends Document {
  title: string
  description?: string
  type: 'location_chain' | 'custom'
  issuedBy: Types.ObjectId
  parentQuestId?: Types.ObjectId
  steps: IQuestStep[]
  qrToken: string
  isActive: boolean
  createdAt: Date
  updatedAt: Date
}

const QuestStepSchema = new Schema<IQuestStep>(
  {
    order: { type: Number, required: true },
    locationId: { type: Schema.Types.ObjectId, required: true },
    locationType: { type: String, enum: ['building', 'floor', 'room'], required: true },
    challenge: { type: String },
  },
  { _id: false }
)

const QuestCardSchema = new Schema<IQuestCard>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, enum: ['location_chain', 'custom'], required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentQuestId: { type: Schema.Types.ObjectId, ref: 'QuestCard' },
    steps: { type: [QuestStepSchema], default: [] },
    qrToken: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
)

QuestCardSchema.index({ parentQuestId: 1 })
QuestCardSchema.index({ issuedBy: 1 })

export const QuestCard: Model<IQuestCard> =
  mongoose.models.QuestCard || mongoose.model<IQuestCard>('QuestCard', QuestCardSchema)
