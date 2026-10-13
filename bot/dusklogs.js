// /dusklogs command for a discord.js v14 bot (CommonJS). Copy this file into your bot's commands folder.
//
//   /dusklogs channel #channel   post every new dusk sign-up in that channel
//   /dusklogs off                stop posting
//   /dusklogs recent [count]     show the latest sign-ups
//   /dusklogs status             show where logs go
//
// The bot needs two environment variables:
//   DUSK_URL          your site, for example https://dusk.onrender.com   (no trailing slash)
//   DUSK_ADMIN_TOKEN  the same long random value you set as DUSK_ADMIN_TOKEN on the site
//
// The log messages themselves are sent by the dusk server using its own bot token (DISCORD_BOT_TOKEN),
// so that bot must be in your server and allowed to View Channel + Send Messages + Embed Links in the log channel.

const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags, ChannelType } = require("discord.js");

async function dusk(method, path, body) {
  const base = (process.env.DUSK_URL || "").replace(/\/+$/, "");
  if (!base || !process.env.DUSK_ADMIN_TOKEN) throw new Error("DUSK_URL and DUSK_ADMIN_TOKEN are not set on the bot.");
  const res = await fetch(base + "/api/admin" + path, {
    method,
    headers: { Authorization: `Bearer ${process.env.DUSK_ADMIN_TOKEN}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || `Dusk answered ${res.status}.`);
  return json;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("dusklogs")
    .setDescription("Sign-up logs for the dusk website")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .setDMPermission(false)
    .addSubcommand(s => s.setName("channel").setDescription("Post every new sign-up in a channel")
      .addChannelOption(o => o.setName("channel").setDescription("Where to post").addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand(s => s.setName("off").setDescription("Stop posting sign-ups"))
    .addSubcommand(s => s.setName("recent").setDescription("Show the latest sign-ups")
      .addIntegerOption(o => o.setName("count").setDescription("How many (1-25)").setMinValue(1).setMaxValue(25)))
    .addSubcommand(s => s.setName("status").setDescription("Show where sign-ups are logged")),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      const sub = interaction.options.getSubcommand();
      if (sub === "channel") {
        const ch = interaction.options.getChannel("channel", true);
        await dusk("PUT", "/logs", { channelId: ch.id });
        return void (await interaction.editReply(`New dusk sign-ups will be posted in ${ch}.`));
      }
      if (sub === "off") {
        await dusk("PUT", "/logs", { channelId: null });
        return void (await interaction.editReply("Sign-up logging is off."));
      }
      if (sub === "status") {
        const s = await dusk("GET", "/logs");
        return void (await interaction.editReply(`${s.channelId ? `Logging to <#${s.channelId}>.` : "Logging is off."} ${s.total} accounts in total.`));
      }
      const list = await dusk("GET", `/signups?limit=${interaction.options.getInteger("count") ?? 10}`);
      if (!list.length) return void (await interaction.editReply("No sign-ups yet."));
      const embed = new EmbedBuilder().setTitle("Latest dusk sign-ups").setColor(0xffffff).setDescription(
        list.map(e => `**${e.username}** · ${e.discordUsername}\nIP \`${e.ip ?? "unknown"}\` · <t:${Math.floor(Date.parse(e.createdAt) / 1000)}:R>`).join("\n\n").slice(0, 4000));
      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply(`Couldn't do that: ${err.message}`);
    }
  },
};
