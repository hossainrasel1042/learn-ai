

import pg from 'pg';

const { types } = pg;


types.setTypeParser(1114, (val) => (val == null ? val : JSON.parse(val)));


types.setTypeParser(114, JSON.parse);


types.setTypeParser(1082, (val) => val);



types.setTypeParser(1184, (val) => (val == null ? val : new Date(val)));

export default types;