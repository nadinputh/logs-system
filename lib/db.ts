import mongoose from 'mongoose'

declare global {
  var _mongoose: { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null } | undefined
}

if (!global._mongoose) {
  global._mongoose = { conn: null, promise: null }
}

export async function connectDB(): Promise<typeof mongoose> {
  if (global._mongoose!.conn) return global._mongoose!.conn

  if (!global._mongoose!.promise) {
    const uri = process.env.MONGODB_URI!
    global._mongoose!.promise = mongoose.connect(uri, {
      bufferCommands: false,
      minPoolSize: 1,
      serverSelectionTimeoutMS: 5000,
    })
  }

  global._mongoose!.conn = await global._mongoose!.promise
  return global._mongoose!.conn
}
