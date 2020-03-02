const express = require("express");
const Joi = require("joi");
const Boom = require("@hapi/boom");
const bcrypt = require("bcryptjs");
const uuidv4 = require("uuid/v4");
const jwt = require("jsonwebtoken");
const { graphql_client } = require("../graphql-client");
const auth_functions = require("./auth-functions");

const {
  USER_FIELDS,
  USER_REGISTRATION_AUTO_ACTIVE,
  USER_MANAGEMENT_DATABASE_SCHEMA_NAME,
  REFRESH_TOKEN_EXPIRES,
  JWT_TOKEN_EXPIRES,
  HASURA_GRAPHQL_JWT_SECRET
} = require("../config");

let router = express.Router();

const schema_name =
  USER_MANAGEMENT_DATABASE_SCHEMA_NAME === "public"
    ? ""
    : USER_MANAGEMENT_DATABASE_SCHEMA_NAME.toString().toLowerCase() + "_";

router.post("/register", async (req, res, next) => {
  let hasura_data;
  let password_hash;

  const schema = Joi.object().keys({
    email: Joi.string()
      .email()
      .required(),
    username: Joi.string().allow(null),
    password: Joi.string().required(),
    register_data: Joi.object().allow(null),
    timezone: Joi.string().required(),
    language: Joi.string().required()
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return next(Boom.badRequest(error.details[0].message));
  }

  const {
    email,
    username,
    password,
    register_data,
    timezone,
    language
  } = value;
  // create user account
  const mutation = `
  mutation (
    $user: ${schema_name}users_insert_input!
  ) {
    insert_${schema_name}users (
      objects: [$user]
    ) {
      affected_rows
      returning {
        id
      }
    }
  }
  `;

  // create user and user_account in same mutation
  try {
    let response = await graphql_client.request(mutation, {
      user: {
        display_name: username,
        email: email,
        active: USER_REGISTRATION_AUTO_ACTIVE,
        secret_token: uuidv4(),
        user_accounts: {
          data: {
            username: username,
            email: email,
            password: await bcrypt.hash(password, 10),
            register_data
          }
        }
      }
    });
    if (response.insert_users && response.insert_users.returning[0].id) {
      let mutationGetId_TimeZone_Language = `query MyQuery {
    dictionary(where: {name: {_like: "${timezone}"}, type: {_eq: "TIMEZONE"}}) {
      id
    }
    dictionary_i18n(where: {label: {_like: "%${language}%"}}) {
      id
    }
  }
  `;
      let response1 = await graphql_client.request(
        mutationGetId_TimeZone_Language
      );

      if (response1.dictionary && response1.dictionary_i18n) {
        let timezoneId = response1.dictionary[0].id;
        let languageId = response1.dictionary_i18n[0].id;

        let mutationAccountSetting = `mutation MyMutation {
          __typename
          insert_account_setting(objects: {language_code: ${languageId}, timezone_code: ${timezoneId}, user_id: "${response.insert_users.returning[0].id}"}) {
            affected_rows
          }
        }
        `;
        await graphql_client.request(mutationAccountSetting);
      } else {
        return next(Boom.badImplementation("Unable to create user."));
      }
    } else {
      return next(Boom.badImplementation("Unable to create user."));
    }
  } catch (e) {
    console.error(e);
    return next(Boom.badImplementation("Unable to create user."));
  }

  res.send("New Client");
});

router.post("/new-password", async (req, res, next) => {
  let hasura_data;
  let password_hash;

  const schema = Joi.object().keys({
    secret_token: Joi.string()
      .uuid({ version: ["uuidv4"] })
      .required(),
    password: Joi.string().required()
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    return next(Boom.badRequest(error.details[0].message));
  }

  const { secret_token, password } = value;

  // update password and username activation token
  try {
    password_hash = await bcrypt.hash(password, 10);
  } catch (e) {
    console.error(e);
    return next(Boom.badImplementation(`Unable to generate 'password_hash'`));
  }

  const query = `
  mutation (
    $secret_token: uuid!,
    $password_hash: String!,
    $new_secret_token: uuid!
    $now: timestamptz!
  ) {
    update_user_account_password: update_${schema_name}user_accounts (
      where: {
        _and: [
          {
            user: {
              secret_token: { _eq: $secret_token}
            },
          }, {
            user: {
              secret_token_expires_at: { _gt: $now }
            }
          }
        ]
      }
      _set: {
        password: $password_hash,
      }
    ) {
      affected_rows
    }
    update_secret_token: update_${schema_name}users (
      where: {
        _and: [
          {
            secret_token: { _eq: $secret_token}
          }, {
            secret_token_expires_at: { _gt: $now }
          }
        ]
      }
      _set: {
        secret_token: $new_secret_token
        secret_token_expires_at: $now
      }
    ) {
      affected_rows
    }
  }
  `;

  try {
    const new_secret_token = uuidv4();
    hasura_data = await graphql_client.request(query, {
      secret_token,
      password_hash,
      new_secret_token,
      now: new Date()
    });
  } catch (e) {
    console.error(e);
    return next(Boom.unauthorized(`Unable to update 'password'`));
  }

  if (hasura_data.update_secret_token.affected_rows === 0) {
    console.error(
      "No user to update password for. Also maybe the secret token has expired"
    );
    return next(Boom.badRequest(`Unable to update password for user`));
  }

  // return 200 OK
  res.send("OK");
});

router.post("/login", async (req, res, next) => {
  // validate username and password
  const schema = Joi.object().keys({
    email: Joi.string().required(),
    password: Joi.string().required()
  });

  const { error, value } = schema.validate(req.body);

  if (error) {
    console.error(error);
    return next(Boom.badRequest(error.details[0].message));
  }

  const { email, password } = value;

  let query = `
  query (
    $email: String!
  ) {
    user_accounts: ${schema_name}user_accounts (
      where: {
        email: { _eq: $email}
      }
    ) {
      password
      user {
        id
        active
        default_role
        user_roles {
          role
        }
        ${USER_FIELDS.join("\n")}
      }
    }
  }
  `;

  let hasura_data;
  try {
    hasura_data = await graphql_client.request(query, {
      email
    });
  } catch (e) {
    console.error(e);
    // console.error('Error connection to GraphQL');
    return next(Boom.unauthorized("Unable to find 'user'"));
  }

  if (hasura_data[`${schema_name}user_accounts`].length === 0) {
    // console.error("No user with this 'username'");
    return next(Boom.unauthorized("Invalid 'username' or 'password'"));
  }

  // check if we got any user back
  const user_account = hasura_data[`${schema_name}user_accounts`][0];

  if (!user_account.user.active) {
    // console.error('User not activated');
    return next(Boom.unauthorized("User not activated."));
  }

  // see if password hashes matches
  const match = await bcrypt.compare(password, user_account.password);

  if (!match) {
    console.error("Password does not match");
    return next(Boom.unauthorized("Invalid 'username' or 'password'"));
  }

  const jwt_token = auth_functions.generateJwtToken(user_account.user);

  // generate refresh token and put in database
  query = `
  mutation (
    $refresh_token_data: ${schema_name}refresh_tokens_insert_input!
  ) {
    insert_${schema_name}refresh_tokens (
      objects: [$refresh_token_data]
    ) {
      affected_rows
    }
  }
  `;

  const refresh_token = uuidv4();
  try {
    await graphql_client.request(query, {
      refresh_token_data: {
        user_id: user_account.user.id,
        refresh_token: refresh_token,
        expires_at: new Date(
          new Date().getTime() + REFRESH_TOKEN_EXPIRES * 60 * 1000
        ) // convert from minutes to milli seconds
      }
    });
  } catch (e) {
    console.error(e);
    return next(
      Boom.badImplementation("Could not update 'refresh token' for user")
    );
  }
  var decoded = jwt.decode(jwt_token, { complete: true });
  let jwt_token_expires = decoded.payload.exp;

  // return jwt token and refresh token to client
  res.json({
    refresh_token,
    jwt_token,
    jwt_token_expires
  });
});

module.exports = router;
