// This util severs the connection to the given pool

const severConnection = async (pool) => {
    try {
        await pool.end();
        console.log("Pool has ended");
    } catch (error) {
        console.error("Error while closing the pool: " + error.message);
    }
} 

module.exports = {
    severConnection,
}