





















import { toIso } from '../utils/date.js';





export class MindMap {
  constructor({
    id,
    userId,
    title,
    description = null,
    sourceType = null,
    sourceId = null,
    rootConcept,
    nodeCount = 0,
    graphJson = { root: '', nodes: [] },
    createdAt,
    updatedAt,
  }) {
    this.id = id;
    this.userId = userId;
    this.title = title;
    this.description = description;
    this.sourceType = sourceType;
    this.sourceId = sourceId;
    this.rootConcept = rootConcept;
    this.nodeCount = nodeCount;
    this.graphJson = graphJson;
    this.createdAt = createdAt;
    this.updatedAt = updatedAt;
  }


  toDict() {
    return {
      id: this.id,
      userId: this.userId,
      title: this.title,
      description: this.description,
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      rootConcept: this.rootConcept,
      nodeCount: this.nodeCount,
      graph: this.graphJson,
      createdAt: toIso(this.createdAt),
      updatedAt: toIso(this.updatedAt),
    };
  }
}





function rowToMap(row) {


  let graph = row.graph_json;
  if (typeof graph === 'string') {
    try {
      graph = JSON.parse(graph);
    } catch {
      graph = { root: '', nodes: [] };
    }
  }
  if (!graph || typeof graph !== 'object') {
    graph = { root: '', nodes: [] };
  }
  if (!Array.isArray(graph.nodes)) graph.nodes = [];

  return new MindMap({
    id: row.id,
    userId: row.user_id,
    title: row.title,
    description: row.description,
    sourceType: row.source_type,
    sourceId: row.source_id,
    rootConcept: row.root_concept,
    nodeCount: row.node_count,
    graphJson: graph,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}






export function mindmapRepository(pool) {
  return {
    async createMindMap({
      userId,
      title,
      description = null,
      sourceType = null,
      sourceId = null,
      rootConcept,
    }) {
      const { rows } = await pool.query(
        `INSERT INTO mind_maps
           (user_id, title, description, source_type, source_id, root_concept)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, user_id, title, description, source_type, source_id,
                   root_concept, node_count, graph_json,
                   created_at, updated_at`,
        [userId, title, description, sourceType, sourceId, rootConcept],
      );
      return rowToMap(rows[0]);
    },

    async listMindMaps(userId, { page = 1, pageSize = 20 } = {}) {
      const offset = (page - 1) * pageSize;
      const { rows } = await pool.query(
        `SELECT id, user_id, title, description, source_type, source_id,
                root_concept, node_count, graph_json,
                created_at, updated_at
         FROM mind_maps
         WHERE user_id = $1
         ORDER BY updated_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, pageSize, offset],
      );
      const countRes = await pool.query(
        `SELECT COUNT(*)::int AS count FROM mind_maps WHERE user_id = $1`,
        [userId],
      );
      return {
        items: rows.map(rowToMap),
        total: countRes.rows[0].count,
      };
    },

    async getMindMap(mindMapId, userId) {
      const { rows } = await pool.query(
        `SELECT id, user_id, title, description, source_type, source_id,
                root_concept, node_count, graph_json,
                created_at, updated_at
         FROM mind_maps
         WHERE id = $1 AND user_id = $2`,
        [mindMapId, userId],
      );
      if (rows.length === 0) return null;
      return rowToMap(rows[0]);
    },

    async updateMindMap(mindMapId, userId, { title, description }) {
      const { rows } = await pool.query(
        `UPDATE mind_maps
         SET title = COALESCE($3, title),
             description = COALESCE($4, description),
             updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, title, description, source_type, source_id,
                   root_concept, node_count, graph_json,
                   created_at, updated_at`,
        [mindMapId, userId, title ?? null, description ?? null],
      );
      if (rows.length === 0) return null;
      return rowToMap(rows[0]);
    },

    async deleteMindMap(mindMapId, userId) {
      const { rowCount } = await pool.query(
        `DELETE FROM mind_maps WHERE id = $1 AND user_id = $2`,
        [mindMapId, userId],
      );
      return rowCount > 0;
    },

    async updateGraph(mindMapId, userId, graph, rootConcept, nodeCount) {
      const { rows } = await pool.query(
        `UPDATE mind_maps
         SET graph_json = $3::jsonb,
             root_concept = $4,
             node_count = $5,
             updated_at = now()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, title, description, source_type, source_id,
                   root_concept, node_count, graph_json,
                   created_at, updated_at`,
        [mindMapId, userId, JSON.stringify(graph), rootConcept, nodeCount],
      );
      if (rows.length === 0) return null;
      return rowToMap(rows[0]);
    },
  };
}
