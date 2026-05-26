import mongoose, { Schema, Document, Model, Types } from 'mongoose'

export interface ICompletedStep {
  stepOrder: number
  locationId: Types.ObjectId
  timestamp: Date
}

export interface IQuestProgress extends Document {
  questCardId: Types.ObjectId
  sessionToken?: string
  userId?: Types.ObjectId
  completedSteps: ICompletedStep[]
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}

const CompletedStepSchema = new Schema<ICompletedStep>(
  {
    stepOrder: { type: Number, required: true },
    locationId: { type: Schema.Types.ObjectId, required: true },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
)

const QuestProgressSchema = new Schema<IQuestProgress>(
  {
    questCardId: { type: Schema.Types.ObjectId, ref: 'QuestCard', required: true, unique: true },
    sessionToken: { type: String },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    completedSteps: { type: [CompletedStepSchema], default: [] },
    completedAt: { type: Date },
  },
  { timestamps: true }
)

QuestProgressSchema.index({ questCardId: 1 }, { unique: true })
QuestProgressSchema.index({ sessionToken: 1 })
QuestProgressSchema.index({ userId: 1 })

export const QuestProgress: Model<IQuestProgress> =
  mongoose.models.QuestProgress ||
  mongoose.model<IQuestProgress>('QuestProgress', QuestProgressSchema)
