import mongoose from 'mongoose';
import type { User } from '../../shared/types';

const userSchema = new mongoose.Schema<User>({
  did: {
    type: String,
    required: true,
    unique: true,
  },
  handle: {
    type: String,
    required: true,
  },
  displayName: {
    type: String,
    required: false,
  },
}, {
  timestamps: true,
});

export default mongoose.model<User>('User', userSchema);
