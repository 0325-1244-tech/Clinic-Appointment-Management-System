// @ts-check
import './components/DataTable.js';
import './components/StatCard.js';
import { App } from './App.js';

const root = document.getElementById('app');
if (root) {
  new App(root).installRoutes().start();
}
