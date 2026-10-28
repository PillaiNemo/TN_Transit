// Registers list / create / update / delete endpoints for one admin resource.
// The SQL itself stays in the resource definition, so every statement is easy to find:
//
//   registerCrud(router, '/cities', {
//     list:   { sql: 'SELECT ...', params: (q) => [...] },
//     insert: 'INSERT ... RETURNING *',            // receives parse() values
//     update: 'UPDATE ... WHERE id = $1 RETURNING *', // receives [id, ...parse() values]
//     remove: 'DELETE ... WHERE id = $1',
//     parse:  async (body, { id }) => [...values],
//   });
import { query } from '../db/pool.js';
import { HttpError, int } from './validate.js';

export function registerCrud(router, path, def) {
  router.get(path, async (req, res) => {
    const { rows } = await query(def.list.sql, def.list.params ? def.list.params(req.query) : []);
    res.json(rows);
  });

  if (def.insert) {
    router.post(path, async (req, res) => {
      const values = await def.parse(req.body ?? {}, { id: null });
      const { rows } = await query(def.insert, values);
      res.status(201).json(rows[0]);
    });
  }

  if (def.update) {
    router.put(`${path}/:id`, async (req, res) => {
      const id = int(req.params.id, 'id', { min: 1 });
      const values = await def.parse(req.body ?? {}, { id });
      const { rows } = await query(def.update, [id, ...values]);
      if (!rows[0]) throw new HttpError(404, 'Record not found');
      res.json(rows[0]);
    });
  }

  if (def.remove) {
    router.delete(`${path}/:id`, async (req, res) => {
      const id = int(req.params.id, 'id', { min: 1 });
      // ON DELETE RESTRICT foreign keys reject deletes of referenced rows (-> 409).
      const { rowCount } = await query(def.remove, [id]);
      if (!rowCount) throw new HttpError(404, 'Record not found');
      res.status(204).end();
    });
  }
}
