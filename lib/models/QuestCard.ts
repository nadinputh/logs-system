import mongoose, { Schema, Document, Model, Types } from "mongoose";

export interface IQuestStep {
  order: number;
  locationId: Types.ObjectId;
  locationType: "building" | "floor" | "room";
  challenge?: string;
}

export interface IQuestCard extends Document {
  teamId: Types.ObjectId;
  title: string;
  description?: string;
  type: "location_chain" | "custom";
  issuedBy: Types.ObjectId;
  parentQuestId?: Types.ObjectId;
  steps: IQuestStep[];
  qrToken: string;
  isActive: boolean;
  cardNumber: number;
  batchSize: number;
  createdAt: Date;
  updatedAt: Date;
}

const QuestStepSchema = new Schema<IQuestStep>(
  {
    order: { type: Number, required: true },
    locationId: { type: Schema.Types.ObjectId, required: true },
    locationType: {
      type: String,
      enum: ["building", "floor", "room"],
      required: true,
    },
    challenge: { type: String },
  },
  { _id: false },
);

const QuestCardSchema = new Schema<IQuestCard>(
  {
    teamId: { type: Schema.Types.ObjectId, ref: "Team", required: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    type: { type: String, enum: ["location_chain", "custom"], required: true },
    issuedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    parentQuestId: { type: Schema.Types.ObjectId, ref: "QuestCard" },
    steps: { type: [QuestStepSchema], default: [] },
    qrToken: { type: String, required: true, unique: true, index: true },
    isActive: { type: Boolean, default: true },
    // 1-indexed position within its issuance batch, and the batch's total
    // size — the only thing that lets staff tell "card 7 of 50" apart from
    // its identical siblings once it's out of their hands. Defaults keep
    // pre-migration documents valid as a batch of one.
    cardNumber: { type: Number, default: 1 },
    batchSize: { type: Number, default: 1 },
  },
  { timestamps: true },
);

QuestCardSchema.index({ teamId: 1, createdAt: -1 });
QuestCardSchema.index({ parentQuestId: 1 });
QuestCardSchema.index({ issuedBy: 1 });

if (
  mongoose.models.QuestCard &&
  !mongoose.models.QuestCard.schema.path("teamId")
) {
  delete mongoose.models.QuestCard;
}

export const QuestCard: Model<IQuestCard> =
  mongoose.models.QuestCard ||
  mongoose.model<IQuestCard>("QuestCard", QuestCardSchema);
