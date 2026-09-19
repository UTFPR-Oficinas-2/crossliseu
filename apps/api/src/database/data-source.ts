import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database.options.js';

export default new DataSource(databaseOptions());
