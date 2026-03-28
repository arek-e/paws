# V1DaemonsRoleGet200ResponseRecentSessionsInner


## Properties

Name | Type | Description | Notes
------------ | ------------- | ------------- | -------------
**session_id** | **UUID** |  | 
**triggered_at** | **datetime** |  | 
**status** | **str** |  | 
**duration_ms** | **int** |  | [optional] 

## Example

```python
from paws_client.models.v1_daemons_role_get200_response_recent_sessions_inner import V1DaemonsRoleGet200ResponseRecentSessionsInner

# TODO update the JSON string below
json = "{}"
# create an instance of V1DaemonsRoleGet200ResponseRecentSessionsInner from a JSON string
v1_daemons_role_get200_response_recent_sessions_inner_instance = V1DaemonsRoleGet200ResponseRecentSessionsInner.from_json(json)
# print the JSON string representation of the object
print(V1DaemonsRoleGet200ResponseRecentSessionsInner.to_json())

# convert the object into a dict
v1_daemons_role_get200_response_recent_sessions_inner_dict = v1_daemons_role_get200_response_recent_sessions_inner_instance.to_dict()
# create an instance of V1DaemonsRoleGet200ResponseRecentSessionsInner from a dict
v1_daemons_role_get200_response_recent_sessions_inner_from_dict = V1DaemonsRoleGet200ResponseRecentSessionsInner.from_dict(v1_daemons_role_get200_response_recent_sessions_inner_dict)
```
[[Back to Model list]](../README.md#documentation-for-models) [[Back to API list]](../README.md#documentation-for-api-endpoints) [[Back to README]](../README.md)


