import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.options.js';
import '../config/env.js';

export default new DataSource(databaseOptions());
