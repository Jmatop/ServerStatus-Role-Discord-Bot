const { Client, Intents } = require('discord.js');
const { MessageActionRow, MessageButton, MessageEmbed } = require('discord.js');
const axios = require('axios'); // Asegúrate de instalar axios usando npm install axios
const CONFIG = require('./config.json');

const client = new Client({
  intents: [
    Intents.FLAGS.GUILDS,
    Intents.FLAGS.GUILD_MESSAGES,
    Intents.FLAGS.GUILD_MEMBERS,
    Intents.FLAGS.DIRECT_MESSAGES,
  ],
});

const roleChannelId = 'la id de tu canal de roles';
const statusChannelId = 'id del canal para enviar mensajes de estado del servidor'; 

const excludedRoles = ['AdminDC', Excepciones de roles que no quieres que se puedan añadir];
const existingTribes = new Set();

client.on('ready', () => {
  console.log(`${client.user.tag} has logged in.`);
  sendRoleButtons();
  sendArkServerStatus();
  // Actualiza el estado del servidor cada 1 minuto
  setInterval(() => sendArkServerStatus(), 1 * 60 * 1000);
});

async function sendRoleButtons() {
  const roleChannel = await client.channels.fetch(roleChannelId);
  if (roleChannel) {
    const createTribeButton = new MessageButton()
      .setCustomId('create_tribe')
      .setLabel('Create Tribe')
      .setStyle('PRIMARY');

    const joinTribeButton = new MessageButton()
      .setCustomId('join_tribe')
      .setLabel('Join Tribe')
      .setStyle('PRIMARY');

    const row = new MessageActionRow().addComponents(createTribeButton, joinTribeButton);

    await roleChannel.send({
      content: 'Choose an option:',
      components: [row],
    });
  } else {
    console.error('Could not find the role channel with the provided ID.');
  }
}
let currentServerStatus = null; // Variable para almacenar el estado actual del servidor

async function sendArkServerStatus() {
  try {
    const response = await axios.get(`https://api.battlemetrics.com/servers/el servidor tuyo`);
    const serverData = response.data.data.attributes;

    const newServerStatus = serverData.status;

    // Verifica si el estado del servidor ha cambiado
    if (newServerStatus !== currentServerStatus) {
      currentServerStatus = newServerStatus; // Actualiza el estado actual

      const statusChannel = await client.channels.fetch(statusChannelId);
      if (statusChannel) {
        // Borra los mensajes previos en el canal
        const messages = await statusChannel.messages.fetch();
        await statusChannel.bulkDelete(messages);

        const statusText = newServerStatus === 'online' ? 'Online' : 'Offline';

        const embed = new MessageEmbed()
          .setTitle('Ark Server Status')
          .addFields(
            { name: 'Server Name', value: serverData.name, inline: true },
            { name: 'Players', value: `${serverData.players}/${serverData.maxPlayers}`, inline: true },
            { name: 'Map', value: serverData.details.map, inline: true },
            { name: 'Status', value: statusText, inline: true }
          )
          .setTimestamp()
          .setColor(newServerStatus === 'online' ? 0x00ff00 : 0xff0000); // Verde para online, rojo para offline

        await statusChannel.send({ embeds: [embed] });
      } else {
        console.error('Could not find the status channel with the provided ID.');
      }
    }
  } catch (error) {
    console.error('Error getting Ark server status:', error);
  }
}

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isButton()) return;

  switch (interaction.customId) {
    case 'create_tribe':
      try {
        const user = await interaction.user.fetch();
        const dmChannel = await user.createDM();

        await dmChannel.send('What should be the name of your tribe? Please respond within 30 seconds.');

        const responseFilter = (message) => message.author.id === user.id && message.channel.type === 'DM';
        const responseCollector = dmChannel.createMessageCollector({
          filter: responseFilter,
          time: 30000,
          max: 1,
        });

        responseCollector.on('collect', async (message) => {
          const tribeName = message.content.trim();

          // Verifica si el nombre de la tribu ya existe
          if (existingTribes.has(tribeName)) {
            await dmChannel.send(`The tribe "${tribeName}" already exists. Please choose a different name.`);
          } else {
            existingTribes.add(tribeName);

            // Crea la tribu en el servidor
            const guild = interaction.guild;
            if (!guild) {
              return interaction.reply('Could not access the server.');
            }

            try {
              const role = await guild.roles.create({
                name: tribeName,
                color: 'RANDOM',
              });

              const member = await guild.members.fetch(user.id);
              await member.roles.add(role);

              await dmChannel.send(`You have created the tribe "${tribeName}" and I have assigned you the role!`);
            } catch (error) {
              console.error('Error creating or assigning the role:', error);
              await dmChannel.send('There was an error processing your request.');
            }
          }
        });

        responseCollector.on('end', (collected, reason) => {
          if (reason === 'time') {
            dmChannel.send('Time ran out to choose the tribe name. Please try again.');
          }
        });
      } catch (error) {
        console.error('Error sending message to user:', error);
        interaction.reply('There was an error processing your request.');
      }
      break;

    case 'join_tribe':
      try {
        const user = await interaction.user.fetch();
        const dmChannel = await user.createDM();

        const guild = interaction.guild;
        const availableRoles = guild.roles.cache.filter(role => !excludedRoles.includes(role.name) && role.name !== '@everyone');
        const availableRoleNames = availableRoles.map(role => role.name);

        await dmChannel.send(`Which tribe would you like to join? Choose one: ${availableRoleNames.join(', ')}`);

        // Espera la respuesta del usuario
        const responseFilter = (message) => message.author.id === user.id && message.channel.type === 'DM';
        const responseCollector = dmChannel.createMessageCollector({
          filter: responseFilter,
          time: 30000,
          max: 1,
        });

        responseCollector.on('collect', async (message) => {
          const roleNameToJoin = message.content.trim();
          const roleToJoin = availableRoles.find(role => role.name === roleNameToJoin);

          if (roleToJoin) {
            const member = await guild.members.fetch(user.id);
            await member.roles.add(roleToJoin);
            await dmChannel.send(`You have joined the tribe "${roleNameToJoin}".`);
          } else {
            await dmChannel.send(`Invalid tribe name. Please try again.`);
          }
        });

        responseCollector.on('end', (collected, reason) => {
          if (reason === 'time') {
            dmChannel.send('Time ran out to choose the tribe name. Please try again.');
          }
        });
      } catch (error) {
        console.error('Error sending message to user:', error);
        interaction.reply('There was an error processing your request.');
      }
      break;
  }
});

// Coloca tu token aquí
client.login(CONFIG.token);

