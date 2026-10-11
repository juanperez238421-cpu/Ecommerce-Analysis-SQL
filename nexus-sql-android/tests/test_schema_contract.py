"""SQLite compatibility checks (fast checks without Android SDK)."""
import sqlite3
import unittest
from pathlib import Path

SCHEMA = Path(__file__).resolve().parents[1] / 'app/src/main/assets/schema.sql'


class SchemaContract(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.executescript(SCHEMA.read_text(encoding='utf-8'))
        self.db.execute("INSERT INTO robots(id,name,x,y,energy,cargo,capacity) VALUES(1,'ADA',4,9,100,0,3)")
        self.db.execute("INSERT INTO robots(id,name,x,y,energy,cargo,capacity) VALUES(2,'ECHO',5,9,100,0,3)")
        self.db.execute("INSERT INTO facilities(id,code,type,x,y) VALUES(1,'ION','CHARGER',5,12)")
        self.db.execute("INSERT INTO facilities(id,code,type,x,y) VALUES(2,'DROP','DEPOT',9,8)")
        self.db.execute("INSERT INTO resource_nodes(id,x,y,resource,stock,max_stock,richness) VALUES(1,8,4,'CRYSTAL',5,5,2)")
        self.db.execute("INSERT INTO resource_nodes(id,x,y,resource,stock,max_stock,richness) VALUES(2,20,10,'ALLOY',5,5,2)")

    def tearDown(self):
        self.db.close()

    def test_jobs_choose_distinct_resources(self):
        jobs = self.db.execute('SELECT robot_id,action,x,y FROM jobs ORDER BY robot_id').fetchall()
        self.assertEqual(jobs, [(1, 'MINE', 8, 4), (2, 'MINE', 20, 10)])

    def test_jobs_charge_below_threshold(self):
        self.db.execute('UPDATE robots SET energy=25 WHERE id=1')
        self.assertEqual(self.db.execute('SELECT action FROM jobs WHERE robot_id=1').fetchone()[0], 'CHARGE')

    def test_jobs_delivery_when_loaded(self):
        self.db.execute("UPDATE robots SET cargo=2,cargo_resource='CRYSTAL' WHERE id=1")
        self.assertEqual(self.db.execute('SELECT action,x,y FROM jobs WHERE robot_id=1').fetchone(), ('DELIVER',9,8))

    def test_jobs_skip_empty_nodes(self):
        self.db.execute('UPDATE resource_nodes SET stock=0 WHERE id=1')
        self.assertEqual(self.db.execute('SELECT x,y FROM jobs WHERE robot_id=1').fetchone(),(20,10))

    def test_readonly_connection_blocks_mutations(self):
        self.db.execute('PRAGMA query_only=ON')
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute('DELETE FROM robots')

    def test_schema_contains_no_window_function(self):
        self.assertNotIn('ROW_NUMBER', SCHEMA.read_text())


if __name__=='__main__':
    unittest.main()
